import CoreFoundation
import Foundation
import UniformTypeIdentifiers

public struct InboxPayload: Codable, Sendable {
  public enum Kind: String, Codable, Sendable { case link, image, note }
  public let kind: Kind
  public let value: String
  public let operationID: String
  public let siri: Bool?

  public init(kind: Kind, value: String, operationID: String = "share:\(UUID().uuidString)", siri: Bool = false) {
    self.kind = kind
    self.value = value
    self.operationID = operationID
    self.siri = siri
  }
}

public enum ShareAttachment: Sendable {
  case payload(InboxPayload)
  case caption(String)

  @MainActor public static func firstAvailable<T: Sendable>(_ offers: [T], read: @MainActor (T) async throws -> Self?) async throws -> Self? {
    var failure: Error?
    for offer in offers {
      do { if let found = try await read(offer) { return found } }
      catch { failure = error }
    }
    if let failure { throw failure }
    return nil
  }

  @MainActor public static func loadLink(from provider: NSItemProvider, type: UTType) async throws -> ShareAttachment? {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, error in
        if let error { continuation.resume(throwing: error); return }
        if let url = item as? URL {
          continuation.resume(returning: ShareAttachment.webLink(url.absoluteString))
          return
        }
        let text = (item as? String) ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
        continuation.resume(returning: text.flatMap { type == .url ? ShareAttachment.webLink($0) : .caption($0) })
      }
    }
  }

  public static func webLink(_ text: String) -> Self? {
    guard let url = SharedWebLink.explicit(text) else { return nil }
    return .payload(InboxPayload(kind: .link, value: url))
  }

  public static func payloads(_ attachments: [Self]) -> [InboxPayload] {
    let explicit = attachments.compactMap { attachment -> String? in
      guard case let .payload(item) = attachment, item.kind == .link else { return nil }
      return item.value
    }
    var links = Set<String>()
    return attachments.compactMap { attachment -> InboxPayload? in
      switch attachment {
      case .payload(let item): return item
      case .caption(let text):
        return SharedWebLink.first(in: text, explicitLinks: explicit)
          .map { InboxPayload(kind: .link, value: $0) }
      }
    }.filter { $0.kind != .link || links.insert($0.value).inserted }
  }
}

public enum ShareInboxError: Error, Equatable, Sendable {
  case ownerChanged, nothingToSave
}

public struct PendingShare: Sendable {
  public enum Content: Sendable {
    case link(String)
    case image(URL)
    case note(String)
  }

  public struct Delivery: Sendable {
    public let content: Content
    public let operationID: String
    public let siri: Bool
  }

  public let delivery: Result<Delivery, any Error>
  fileprivate let manifest: URL
  private let inbox: ShareInbox
  private let owner: String

  fileprivate init(manifest: URL, inbox: ShareInbox, owner: String) {
    self.manifest = manifest
    self.inbox = inbox
    self.owner = owner
    delivery = Result {
      let payload = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: manifest))
      let content: Content
      switch payload.kind {
      case .link:
        content = .link(payload.value)
      case .note:
        content = .note(payload.value)
      case .image:
        guard UUID(uuidString: payload.value) != nil else { throw CocoaError(.fileReadCorruptFile) }
        content = .image(manifest.deletingLastPathComponent().appending(path: payload.value))
      }
      return Delivery(content: content, operationID: payload.operationID, siri: payload.siri == true)
    }
  }

  public func discard() throws {
    try removeManifest()
    if case let .success(upload) = delivery, case let .image(file) = upload.content {
      inbox.removeUnreferencedImage(file, in: manifest.deletingLastPathComponent())
    }
  }

  fileprivate func removeManifest() throws {
    try inbox.checkOwner(owner, of: manifest.deletingLastPathComponent())
    try FileManager.default.removeItem(at: manifest)
  }
}

public struct ShareInbox: Sendable {
  public static let notification = "app.shelvr.share-inbox.ready"
  private static let stagingLifetime: TimeInterval = 24 * 60 * 60
  let directory: URL

  public struct FailedShare: Sendable {
    public let share: PendingShare
    public let error: any Error
  }

  public init(directory: URL) { self.directory = directory }

  public static func system() -> ShareInbox? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ShelvrAppGroup") as? String,
      let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return ShareInbox(directory: root.appending(path: "SwiftShareInbox"))
  }

  public var activeOwner: String? { try? owner(of: directory) }

  public func activate(_ owner: String?) throws {
    let marker = directory.appending(path: "owner")
    guard let owner else { try removeIfPresent(marker); return }

    let manager = FileManager.default
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    var location = URL(filePath: directory.path, directoryHint: .isDirectory)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try location.setResourceValues(values)
    if activeOwner != owner { try Data(owner.utf8).write(to: marker, options: .atomic) }
  }

  public func prune(keeping owner: String?) throws {
    guard activeOwner == owner else { throw ShareInboxError.ownerChanged }
    let entries = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
    for batch in entries {
      switch batch.pathExtension {
      case "ready":
        if (try? self.owner(of: batch)) != owner { try removeIfPresent(batch) }
      case "staging":
        if let created = try? batch.resourceValues(forKeys: [.creationDateKey]).creationDate,
          Date().timeIntervalSince(created) > Self.stagingLifetime { try removeIfPresent(batch) }
      default: break
      }
    }
  }

  public func stage(owner: String) throws -> URL {
    guard activeOwner == owner else { throw ShareInboxError.ownerChanged }
    let folder = directory.appending(path: UUID().uuidString + ".staging")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    do { try Data(owner.utf8).write(to: folder.appending(path: "owner")) }
    catch { try? removeIfPresent(folder); throw error }
    return folder
  }

  public func newImage(in stage: URL) -> (file: URL, payload: InboxPayload) {
    let name = UUID().uuidString
    return (stage.appending(path: name), InboxPayload(kind: .image, value: name))
  }

  public func publish(_ payloads: [InboxPayload], in stage: URL) throws {
    guard !payloads.isEmpty else { throw ShareInboxError.nothingToSave }
    let owner = try owner(of: stage)
    try checkOwner(owner, of: stage)
    for (index, payload) in payloads.enumerated() {
      try JSONEncoder().encode(payload).write(to: stage.appending(path: "\(index).json"))
    }
    try checkOwner(owner, of: stage)
    try FileManager.default.moveItem(at: stage, to: stage.deletingPathExtension().appendingPathExtension("ready"))
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(Self.notification as CFString), nil, nil, true)
  }

  @MainActor public func drain(owner: String, send: (PendingShare.Delivery) async throws -> Void) async throws -> FailedShare? {
    guard activeOwner == owner else { throw ShareInboxError.ownerChanged }
    var firstFailure: FailedShare?
    for batch in try batches() where (try? self.owner(of: batch)) == owner {
      for file in try manifests(in: batch) {
        try Task.checkCancellation()
        try checkOwner(owner, of: batch)
        let share = PendingShare(manifest: file, inbox: self, owner: owner)
        do {
          try await send(share.delivery.get())
          try Task.checkCancellation()
          try share.removeManifest()
        } catch is CancellationError { throw CancellationError() }
        catch ShareInboxError.ownerChanged { throw ShareInboxError.ownerChanged }
        catch {
          try Task.checkCancellation()
          try checkOwner(owner, of: batch)
          if firstFailure == nil { firstFailure = FailedShare(share: share, error: error) }
        }
      }
      if try manifests(in: batch).isEmpty { try removeIfPresent(batch) }
    }
    return firstFailure
  }

  fileprivate func checkOwner(_ owner: String, of batch: URL) throws {
    guard activeOwner == owner, (try? self.owner(of: batch)) == owner else { throw ShareInboxError.ownerChanged }
  }

  func batches() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "ready" }
  }

  private func owner(of batch: URL) throws -> String {
    let value = try String(contentsOf: batch.appending(path: "owner"), encoding: .utf8)
    guard !value.isEmpty else { throw ShareInboxError.ownerChanged }
    return value
  }

  func manifests(in batch: URL) throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: batch, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
  }

  fileprivate func removeUnreferencedImage(_ file: URL, in batch: URL) {
    guard let id = UUID(uuidString: file.lastPathComponent) else { return }
    let referenced = try? manifests(in: batch).contains { manifest in
      let item = try JSONDecoder().decode(InboxPayload.self, from: Data(contentsOf: manifest))
      return item.kind == .image && UUID(uuidString: item.value) == id
    }
    if referenced == false { try? removeIfPresent(file) }
  }

  private func removeIfPresent(_ file: URL) throws {
    do { try FileManager.default.removeItem(at: file) }
    catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {}
  }
}

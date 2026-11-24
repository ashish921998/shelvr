import CoreFoundation
import Foundation

public struct InboxPayload: Codable, Sendable {
  public enum Kind: String, Codable, Sendable { case link, image, note }
  public let kind: Kind
  public let value: String
  public let operationID: String
  public let siri: Bool?
  public let spaceID: String?
  public let context: String?
  public let sticker: Bool?

  public init(kind: Kind, value: String, operationID: String = "share:\(UUID().uuidString)", siri: Bool = false, spaceID: String? = nil, context: String? = nil, sticker: Bool? = nil) {
    self.kind = kind
    self.value = value
    self.operationID = operationID
    self.siri = siri
    self.spaceID = spaceID
    self.context = context.map { String($0.prefix(8000)) }
    self.sticker = sticker
  }
}

public enum ShareAttachment: Sendable {
  case payload(InboxPayload)
  case caption(String)

  public static func payloads(_ attachments: [Self]) -> [InboxPayload] {
    let explicit = attachments.compactMap { attachment -> String? in
      guard case let .payload(item) = attachment, item.kind == .link else { return nil }
      return item.value
    }
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    return attachments.compactMap { attachment in
      switch attachment {
      case .payload(let item): return item
      case .caption(let text):
        guard let match = detector?.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let url = match.url, ["https", "http"].contains(url.scheme?.lowercased()),
          let start = Range(match.range, in: text)?.lowerBound else { return nil }
        let preserved = explicit.first { $0.hasPrefix(url.absoluteString) && text[start...].hasPrefix($0) }
        return InboxPayload(kind: .link, value: preserved ?? url.absoluteString)
      }
    }
  }
}

public struct ShareInbox: Sendable {
  public static let notification = "app.shelvr.share-inbox.ready"
  public let directory: URL

  public init(directory: URL) { self.directory = directory }

  public static func system() -> ShareInbox? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ShelvrAppGroup") as? String,
      let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return ShareInbox(directory: root.appending(path: "SwiftShareInbox"))
  }

  public var activeOwner: String? {
    guard let value = try? String(contentsOf: directory.appending(path: "owner"), encoding: .utf8),
      !value.isEmpty else { return nil }
    return value
  }

  public func activate(_ owner: String?) throws {
    let manager = FileManager.default
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    var location = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try location.setResourceValues(values)
    let marker = directory.appending(path: "owner")
    if let owner {
      try Data(owner.utf8).write(to: marker, options: .atomic)
    } else if manager.fileExists(atPath: marker.path) {
      try manager.removeItem(at: marker)
    }
    for batch in try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
    where ["ready", "staging"].contains(batch.pathExtension) {
      let stale = (try? batch.resourceValues(forKeys: [.creationDateKey]).creationDate)
        .map { Date().timeIntervalSince($0) > 86400 } ?? false
      if batch.pathExtension == "staging" ? stale : (try? self.owner(of: batch)) != owner {
        try manager.removeItem(at: batch)
      }
    }
  }

  public func stage(owner: String) throws -> URL {
    guard activeOwner == owner else { throw CocoaError(.userCancelled) }
    let folder = directory.appending(path: UUID().uuidString + ".staging")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    try Data(owner.utf8).write(to: folder.appending(path: "owner"))
    return folder
  }

  public func publish(_ payloads: [InboxPayload], in stage: URL) throws {
    guard !payloads.isEmpty, activeOwner == (try owner(of: stage)) else { throw CocoaError(.userCancelled) }
    var links = Set<String>()
    for (index, payload) in payloads.enumerated() {
      if payload.kind == .link && !links.insert(payload.value).inserted { continue }
      try JSONEncoder().encode(payload).write(to: stage.appending(path: "\(index).json"))
    }
    try FileManager.default.moveItem(at: stage, to: stage.deletingPathExtension().appendingPathExtension("ready"))
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(Self.notification as CFString), nil, nil, true)
  }

  public func batches() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "ready" }
  }

  public func owner(of batch: URL) throws -> String {
    try String(contentsOf: batch.appending(path: "owner"), encoding: .utf8)
  }

  public func manifests(in batch: URL) throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: batch, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
  }
}

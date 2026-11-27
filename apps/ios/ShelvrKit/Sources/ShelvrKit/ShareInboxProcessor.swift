import Foundation
import ShelvrInbox

@MainActor
protocol ShareSaver {
  var userID: String? { get }
  func saveLink(_ url: String, operationID: String, source: SaveSource, analyticsSessionID: String?, checkpoint: () throws -> Void) async throws
  func saveNote(_ text: String, operationID: String, source: SaveSource, analyticsSessionID: String?, checkpoint: () throws -> Void) async throws
  func savePhoto(_ photo: ImportPhoto, operationID: String, source: SaveSource, analyticsSessionID: String?, checkpoint: () throws -> Void) async throws -> String
}

extension Backend: ShareSaver {}

@MainActor
public struct ShareInboxProcessor {
  public typealias SiriDelivery = @MainActor (PendingShare.Delivery, String, () throws -> Void) async throws -> Void

  public struct Attempt: Equatable, Sendable {
    public let operationID: String
    public let kind: String
    public let source: SaveSource

    init(_ delivery: PendingShare.Delivery) {
      operationID = delivery.operationID
      source = delivery.siri ? .siri : .shareExtension
      switch delivery.content {
      case .link: kind = "link"
      case .note: kind = "note"
      case .image: kind = "image"
      }
    }
  }

  public enum Event: Equatable, Sendable {
    case started(Attempt)
    case failed(Attempt, SaveFailure)
  }

  public struct Failure: Sendable {
    public let share: PendingShare?
    public let copyKey: String
    public let canRecoverNote: Bool
    public let requiresPro: Bool

    public init(
      share: PendingShare? = nil,
      copyKey: String = "share.retryHelp",
      canRecoverNote: Bool = false,
      requiresPro: Bool = false
    ) {
      self.share = share
      self.copyKey = copyKey
      self.canRecoverNote = canRecoverNote
      self.requiresPro = requiresPro
    }
  }

  private let inbox: ShareInbox
  private let saver: any ShareSaver

  public init(inbox: ShareInbox, backend: Backend) {
    self.init(inbox: inbox, saver: backend)
  }

  init(inbox: ShareInbox, saver: any ShareSaver) {
    self.inbox = inbox
    self.saver = saver
  }

  public func updateOwner() throws { try inbox.activate(saver.userID) }

  public func drain(
    owner: String,
    analyticsSessionID: String? = nil,
    deliverSiri: SiriDelivery? = nil,
    observe: (Event) -> Void = { _ in }
  ) async throws -> Failure? {
    let checkpoint = {
      try Task.checkCancellation()
      guard saver.userID == owner else { throw ShareInboxError.ownerChanged }
    }
    try checkpoint()
    try updateOwner()
    try inbox.prune(keeping: owner)
    let refusal = try await inbox.drain(owner: owner) { delivery in
      try checkpoint()
      let attempt = Attempt(delivery)
      observe(.started(attempt))
      do {
        try await send(delivery, owner: owner, source: attempt.source, analyticsSessionID: analyticsSessionID,
          deliverSiri: deliverSiri, checkpoint: checkpoint)
        try checkpoint()
      } catch {
        try checkpoint()
        observe(.failed(attempt, SaveFailure(error)))
        throw error
      }
    }
    return refusal.map {
      if ($0.error as? ShareInboxError) == .longNoteNeedsRecovery {
        return Failure(share: $0.share, copyKey: "share.longNoteRecovery", canRecoverNote: true)
      }
      let failure = SaveFailure($0.error)
      return Failure(share: $0.share, copyKey: Self.copyKey(for: $0.share, failure: failure),
        requiresPro: failure == .proRequired)
    }
  }

  private func send(_ delivery: PendingShare.Delivery, owner: String, source: SaveSource, analyticsSessionID: String?,
    deliverSiri: SiriDelivery?, checkpoint: () throws -> Void) async throws {
    if delivery.siri, let deliverSiri {
      try await deliverSiri(delivery, owner, checkpoint)
      return
    }
    switch delivery.content {
    case .link(let url):
      try await saver.saveLink(url, operationID: delivery.operationID, source: source,
        analyticsSessionID: analyticsSessionID, checkpoint: checkpoint)
    case .note(let text):
      guard SiriText.fitsLibrary(text) else { throw ShareInboxError.longNoteNeedsRecovery }
      try await saver.saveNote(text, operationID: delivery.operationID, source: source,
        analyticsSessionID: analyticsSessionID, checkpoint: checkpoint)
    case .image(let file):
      let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: file, options: .mappedIfSafe)) }.value
      _ = try await saver.savePhoto(photo, operationID: delivery.operationID, source: source,
        analyticsSessionID: analyticsSessionID, checkpoint: checkpoint)
    }
  }

  private static func copyKey(for share: PendingShare, failure: SaveFailure) -> String {
    if failure == .other { return "share.retryHelp" }
    if failure == .proRequired, case .success(let delivery) = share.delivery {
      switch delivery.content {
      case .link, .note: return "freePlan.leftBody"
      case .image: break
      }
    }
    return failure.photoCopyKey
  }
}

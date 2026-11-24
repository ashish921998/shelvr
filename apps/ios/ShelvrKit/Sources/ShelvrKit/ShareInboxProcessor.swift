import Foundation
import ShelvrInbox

@MainActor
protocol ShareSaver {
  var userID: String? { get }
  func saveLink(_ url: String, operationID: String, source: SaveSource, analyticsSessionID: String?, checkpoint: () throws -> Void) async throws
  func saveNote(_ text: String, operationID: String, checkpoint: () throws -> Void) async throws
  func savePhoto(_ photo: ImportPhoto, operationID: String, source: SaveSource, checkpoint: () throws -> Void) async throws -> String
}

extension Backend: ShareSaver {}

@MainActor
public struct ShareInboxProcessor {
  public typealias SiriDelivery = @MainActor (PendingShare.Delivery, String, () throws -> Void) async throws -> Void

  public struct Failure: Sendable {
    public let share: PendingShare?
    public let copyKey: String
    public let canRecoverNote: Bool
    public init(share: PendingShare? = nil, copyKey: String = "share.retryHelp", canRecoverNote: Bool = false) {
      self.share = share
      self.copyKey = copyKey
      self.canRecoverNote = canRecoverNote
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

  public func drain(owner: String, deliverSiri: SiriDelivery? = nil) async throws -> Failure? {
    let checkpoint = {
      try Task.checkCancellation()
      guard saver.userID == owner else { throw ShareInboxError.ownerChanged }
    }
    try checkpoint()
    if inbox.activeOwner != owner { try updateOwner() }
    try inbox.prune(keeping: owner)
    let refusal = try await inbox.drain(owner: owner) { delivery in
      try checkpoint()
      if delivery.siri, let deliverSiri {
        try await deliverSiri(delivery, owner, checkpoint)
        try checkpoint()
        return
      }
      let source: SaveSource = delivery.siri ? .siri : .shareExtension
      switch delivery.content {
      case .link(let url):
        try await saver.saveLink(url, operationID: delivery.operationID, source: source, analyticsSessionID: nil, checkpoint: checkpoint)
      case .note(let text):
        try await saver.saveNote(text, operationID: delivery.operationID, checkpoint: checkpoint)
      case .image(let file):
        let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: file, options: .mappedIfSafe)) }.value
        _ = try await saver.savePhoto(photo, operationID: delivery.operationID, source: source, checkpoint: checkpoint)
      }
      try checkpoint()
    }
    return refusal.map {
      if ($0.error as? ShareInboxError) == .longNoteNeedsRecovery {
        return Failure(share: $0.share, copyKey: "share.longNoteRecovery", canRecoverNote: true)
      }
      return Failure(share: $0.share, copyKey: Self.copyKey(for: $0))
    }
  }

  private static func copyKey(for refusal: ShareInbox.FailedShare) -> String {
    let failure = SaveFailure(refusal.error)
    if failure == .other { return "share.retryHelp" }
    if failure == .proRequired, case .success(let delivery) = refusal.share.delivery {
      switch delivery.content {
      case .link, .note: return "freePlan.leftBody"
      case .image: break
      }
    }
    return failure.photoCopyKey
  }
}

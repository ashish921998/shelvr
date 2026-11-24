import Foundation
import ShelvrInbox

@MainActor
protocol ShareSaver {
  var userID: String? { get }
  func saveLink(_ url: String, operationID: String, source: SaveSource, checkpoint: () throws -> Void) async throws
  func savePhoto(_ photo: ImportPhoto, operationID: String, source: SaveSource, checkpoint: () throws -> Void) async throws -> String
}

extension Backend: ShareSaver {}

@MainActor
public struct ShareInboxProcessor {
  public struct Failure: Sendable {
    public let share: PendingShare?
    public let copyKey: String
    public init(share: PendingShare? = nil, copyKey: String = "share.retryHelp") {
      self.share = share
      self.copyKey = copyKey
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

  public func drain(owner: String) async throws -> Failure? {
    let checkpoint = {
      try Task.checkCancellation()
      guard saver.userID == owner else { throw ShareInboxError.ownerChanged }
    }
    try checkpoint()
    try inbox.activate(owner)
    try inbox.prune(keeping: owner)
    let refusal = try await inbox.drain(owner: owner) { delivery in
      try checkpoint()
      switch delivery.content {
      case .link(let url):
        try await saver.saveLink(url, operationID: delivery.operationID, source: .shareExtension, checkpoint: checkpoint)
      case .image(let file):
        let photo = try await Task.detached { try ImportPhoto(Data(contentsOf: file, options: .mappedIfSafe)) }.value
        _ = try await saver.savePhoto(photo, operationID: delivery.operationID, source: .shareExtension, checkpoint: checkpoint)
      }
      try checkpoint()
    }
    return refusal.map { Failure(share: $0.share, copyKey: Self.copyKey(for: $0)) }
  }

  private static func copyKey(for refusal: ShareInbox.FailedShare) -> String {
    let failure = SaveFailure(refusal.error)
    if failure == .other { return "share.retryHelp" }
    if failure == .proRequired, case .success(let delivery) = refusal.share.delivery,
      case .link = delivery.content { return "freePlan.leftBody" }
    return failure.photoCopyKey
  }
}

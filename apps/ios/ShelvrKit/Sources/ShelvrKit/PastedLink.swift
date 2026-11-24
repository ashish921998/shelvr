import ConvexMobile
import Foundation
import ShelvrInbox

public struct PastedLink: Sendable {
  public let url: String
  public let operationID: String

  public init?(_ input: String, retrying prior: PastedLink? = nil) {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.contains(where: { $0.isWhitespace }) {
      guard let link = SharedWebLink.first(in: trimmed) else { return nil }
      url = link
    } else {
      guard trimmed.contains(".") else { return nil }
      url = trimmed
    }
    if let prior, prior.url == url {
      operationID = prior.operationID
    } else {
      operationID = "link:\(UUID().uuidString)"
    }
  }
}

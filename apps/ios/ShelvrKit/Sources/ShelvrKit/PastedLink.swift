import ConvexMobile
import Foundation
import ShelvrInbox

public struct PastedLink: Sendable {
  public let url: String
  public let operationID: String

  public static func planningFailure(_ error: Error) -> String {
    if SaveFailure(error) == .proRequired { return "pro_required" }
    struct Failure: Decodable { let kind: String? }
    if case let ClientError.ConvexError(data) = error,
      (try? JSONDecoder().decode(Failure.self, from: Data(data.utf8)))?.kind == "RateLimited" {
      return "rate_limited"
    }
    return "error"
  }

  public init?(_ input: String, retrying prior: PastedLink? = nil) {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.contains(where: { $0.isWhitespace }) {
      guard let link = SharedWebLink.first(in: trimmed, requiringScheme: true) else { return nil }
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

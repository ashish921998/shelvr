import ConvexMobile
import Foundation

public struct PastedLink: Sendable {
  public let url: String
  public let operationID: String

  public static func requiresPro(_ error: Error) -> Bool {
    struct Failure: Decodable { let code: String }
    guard case let ClientError.ConvexError(data) = error else { return false }
    return (try? JSONDecoder().decode(Failure.self, from: Data(data.utf8)))?.code == "pro_required"
  }

  public init?(_ input: String, retrying prior: PastedLink? = nil) {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.contains(where: { $0.isWhitespace }) {
      guard let range = trimmed.range(of: #"https?://[^\s<>"]+"#,
        options: [.regularExpression, .caseInsensitive]) else { return nil }
      var match = String(trimmed[range])
      while let last = match.last {
        if ".,;:!?'".contains(last) {
          match.removeLast()
        } else if (last == ")" || last == "]"),
          match.filter({ $0 == last }).count > match.filter({ $0 == (last == ")" ? "(" : "[") }).count
        {
          match.removeLast()
        } else { break }
      }
      url = match
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

import Foundation

public struct AuthTokens: Codable, Sendable, Equatable {
  public let token: String
  public let refreshToken: String

  public init(token: String, refreshToken: String) {
    self.token = token
    self.refreshToken = refreshToken
  }

  var lifetime: TimeInterval? { JWT.claims(of: token).map { $0.exp - $0.iat } }
}

enum JWT {
  struct Claims: Decodable {
    let sub: String?
    let iat: TimeInterval
    let exp: TimeInterval
  }

  static func claims(of jwt: String) -> Claims? {
    let parts = jwt.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 3 else { return nil }
    var base64 = parts[1].replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    guard let data = Data(base64Encoded: base64) else { return nil }
    return try? JSONDecoder().decode(Claims.self, from: data)
  }
}

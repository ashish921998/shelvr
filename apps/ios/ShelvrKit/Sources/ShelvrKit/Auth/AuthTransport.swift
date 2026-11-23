import Foundation

public struct SignInRequest: Encodable, Sendable, Equatable {
  public var provider: String?
  public var params: [String: String]?
  public var verifier: String?
  public var refreshToken: String?

  public init(
    provider: String? = nil,
    params: [String: String]? = nil,
    verifier: String? = nil,
    refreshToken: String? = nil
  ) {
    self.provider = provider
    self.params = params
    self.verifier = verifier
    self.refreshToken = refreshToken
  }
}

public struct SignInResponse: Decodable, Sendable, Equatable {
  public var tokens: AuthTokens?
  public var redirect: String?
  public var verifier: String?

  public init(tokens: AuthTokens? = nil, redirect: String? = nil, verifier: String? = nil) {
    self.tokens = tokens
    self.redirect = redirect
    self.verifier = verifier
  }
}

public protocol AuthTransport: Sendable {
  func signIn(_ request: SignInRequest) async throws -> SignInResponse
}

public enum ConvexCallError: Error, Equatable {
  case server(String)
  case badResponse(Int)
}

public struct ConvexHTTPAuthTransport: AuthTransport {
  let endpoint: URL
  let session: URLSession

  public init(deployment: URL, session: URLSession = .shared) {
    self.endpoint = deployment.appending(path: "api/action")
    self.session = session
  }

  public func signIn(_ request: SignInRequest) async throws -> SignInResponse {
    var http = URLRequest(url: endpoint)
    http.httpMethod = "POST"
    http.setValue("application/json", forHTTPHeaderField: "Content-Type")
    http.httpBody = try JSONEncoder().encode(Call(path: "auth:signIn", args: request))
    let (data, response) = try await session.data(for: http)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard let reply = try? JSONDecoder().decode(Reply.self, from: data) else {
      throw ConvexCallError.badResponse(status)
    }
    guard reply.status == "success", let value = reply.value else {
      throw ConvexCallError.server(reply.errorMessage ?? "status \(status)")
    }
    return value
  }

  private struct Call: Encodable {
    let path: String
    let args: SignInRequest
    let format = "json"
  }

  private struct Reply: Decodable {
    let status: String
    let value: SignInResponse?
    let errorMessage: String?
  }
}

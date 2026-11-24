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
  func signOut(token: String) async throws
}

public enum ConvexCallError: Error, Equatable {
  case server(String)
  case badResponse(Int)
}

public struct ConvexHTTPAuthTransport: AuthTransport {
  let endpoint: URL
  let session: URLSession

  public init(deployment: URL, session: URLSession = .shared) {
    self.endpoint = deployment.appending(path: "api")
    self.session = session
  }

  public func signIn(_ request: SignInRequest) async throws -> SignInResponse {
    guard let value = try await call("auth:signIn", args: request, returning: SignInResponse.self) else {
      throw ConvexCallError.server("empty reply")
    }
    return value
  }

  public func signOut(token: String) async throws {
    _ = try await call("auth:signOut", args: [String: String](), token: token, returning: Ignored.self)
  }

  func revokeSiri(_ capture: String, authorization: String) async throws {
    _ = try await call("appIntents:revokeCaptureToken", args: ["token": capture], token: authorization,
      returning: Ignored.self, function: .mutation)
  }

  enum SiriNoteResult { case saved, folderUnavailable }

  func saveSiriNote(_ args: [String: String], authorization: String) async throws -> SiriNoteResult {
    do {
      guard try await call("items:createNoteItem", args: args, token: authorization,
        returning: String.self, function: .mutation) != nil else {
        throw ConvexCallError.server("empty reply")
      }
      return .saved
    } catch let ConvexCallError.server(message) where args["spaceId"] != nil &&
      message.split(whereSeparator: \.isNewline).contains(where: {
        $0 == "Space not found" || $0 == "Uncaught Error: Space not found"
      }) {
      return .folderUnavailable
    }
  }

  private enum Function: String { case action, mutation }

  private func call<Args: Encodable, Value: Decodable>(
    _ path: String, args: Args, token: String? = nil, returning: Value.Type, function: Function = .action
  ) async throws -> Value? {
    var http = URLRequest(url: endpoint.appending(path: function.rawValue))
    http.httpMethod = "POST"
    http.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let token { http.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    http.httpBody = try JSONEncoder().encode(Call(path: path, args: args))
    let (data, response) = try await session.data(for: http)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard let reply = try? JSONDecoder().decode(Reply<Value>.self, from: data) else {
      throw ConvexCallError.badResponse(status)
    }
    guard reply.status == "success" else {
      if path == "items:createNoteItem",
        (try? JSONDecoder().decode(SaveRefusal.self, from: data))?.errorData.code == "pro_required" {
        throw SaveFailure.proRequired
      }
      throw ConvexCallError.server(reply.errorMessage ?? "status \(status)")
    }
    return reply.value
  }

  private struct Call<Args: Encodable>: Encodable {
    let path: String
    let args: Args
    let format = "json"
  }

  private struct Reply<Value: Decodable>: Decodable {
    let status: String
    let value: Value?
    let errorMessage: String?
  }

  private struct SaveRefusal: Decodable {
    struct Details: Decodable { let code: String }
    let errorData: Details
  }

  private struct Ignored: Decodable {}
}

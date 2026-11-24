import Foundation
import Synchronization

@testable import ShelvrKit

final class MemoryVault: TokenVault {
  private let stored: Mutex<AuthTokens?>

  init(_ tokens: AuthTokens? = nil) {
    stored = Mutex(tokens)
  }

  var tokens: AuthTokens? { stored.withLock { $0 } }
  func read() -> AuthTokens? { tokens }
  func write(_ tokens: AuthTokens?) { stored.withLock { $0 = tokens } }
}

final class FakeTransport: AuthTransport {
  enum Reply: Sendable {
    case respond(SignInResponse)
    case fail
  }

  struct Offline: Error {}

  private let state: Mutex<(replies: [Reply], requests: [SignInRequest])>
  private let delay: Duration

  init(_ replies: [Reply], delay: Duration = .zero) {
    state = Mutex((replies, []))
    self.delay = delay
  }

  var requests: [SignInRequest] { state.withLock { $0.requests } }

  func signIn(_ request: SignInRequest) async throws -> SignInResponse {
    let reply = state.withLock { state in
      state.requests.append(request)
      return state.replies.isEmpty ? Reply.fail : state.replies.removeFirst()
    }
    if delay > .zero {
      let seconds = Double(delay.components.seconds) + Double(delay.components.attoseconds) / 1e18
      await withCheckedContinuation { done in
        DispatchQueue.global().asyncAfter(deadline: .now() + seconds) { done.resume() }
      }
    }
    switch reply {
    case let .respond(response): return response
    case .fail: throw Offline()
    }
  }
}

final class LegacyStore: LegacySessionStore {
  private let token: Mutex<String?>

  init(_ token: String?) {
    self.token = Mutex(token)
  }

  func refreshToken() -> String? { token.withLock { $0 } }
  func forget() { token.withLock { $0 = nil } }
}

final class Clock: Sendable {
  private let current = Mutex(Date(timeIntervalSince1970: 1_800_000_000))
  var now: Date { current.withLock { $0 } }
  func advance(_ seconds: TimeInterval) { current.withLock { $0 += seconds } }
}

func jwt(lifetime: TimeInterval, issuedAt: TimeInterval = 1_800_000_000) -> String {
  let claims = #"{"sub":"user","iat":\#(Int(issuedAt)),"exp":\#(Int(issuedAt + lifetime))}"#
  let payload = Data(claims.utf8).base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
  return "eyJhbGciOiJSUzI1NiJ9.\(payload).signature"
}

func tokens(_ name: String, lifetime: TimeInterval = 3600) -> AuthTokens {
  AuthTokens(token: jwt(lifetime: lifetime) + name, refreshToken: "refresh-\(name)")
}

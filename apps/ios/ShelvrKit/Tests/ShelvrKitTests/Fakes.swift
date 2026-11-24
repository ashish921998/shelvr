import Foundation
import Synchronization
import Testing

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

struct ReadOnlyVault: TokenVault {
  let tokens: AuthTokens?
  func read() -> AuthTokens? { tokens }
  func write(_ tokens: AuthTokens?) {}
}

final class Gate: Sendable {
  private let state = Mutex<(isOpen: Bool, waiting: [CheckedContinuation<Void, Never>])>((false, []))

  func wait() async {
    await withCheckedContinuation { waiter in
      let isOpen = state.withLock { state in
        if !state.isOpen { state.waiting.append(waiter) }
        return state.isOpen
      }
      if isOpen { waiter.resume() }
    }
  }

  func open() {
    let waiting = state.withLock { state in
      state.isOpen = true
      defer { state.waiting = [] }
      return state.waiting
    }
    for waiter in waiting { waiter.resume() }
  }
}

func eventually(_ condition: () -> Bool) async throws {
  for _ in 0..<5000 where !condition() {
    try await Task.sleep(for: .milliseconds(1))
  }
  #expect(condition())
}

final class FakeTransport: AuthTransport {
  enum Reply: Sendable {
    case respond(SignInResponse)
    case fail
  }

  struct Offline: Error {}

  private let state: Mutex<(replies: [Reply], requests: [SignInRequest], signOuts: [String])>
  private let delay: Duration
  private let gate: Gate?
  private let signOutGate: Gate?

  init(_ replies: [Reply], delay: Duration = .zero, gate: Gate? = nil, signOutGate: Gate? = nil) {
    state = Mutex((replies, [], []))
    self.delay = delay
    self.gate = gate
    self.signOutGate = signOutGate
  }

  var requests: [SignInRequest] { state.withLock { $0.requests } }
  var signOuts: [String] { state.withLock { $0.signOuts } }

  func signIn(_ request: SignInRequest) async throws -> SignInResponse {
    let reply = state.withLock { state in
      state.requests.append(request)
      return state.replies.isEmpty ? Reply.fail : state.replies.removeFirst()
    }
    await wait(delay)
    await gate?.wait()
    switch reply {
    case let .respond(response): return response
    case .fail: throw Offline()
    }
  }

  func signOut(token: String) async throws {
    state.withLock { $0.signOuts.append(token) }
    await signOutGate?.wait()
  }

  private func wait(_ delay: Duration) async {
    guard delay > .zero else { return }
    let seconds = Double(delay.components.seconds) + Double(delay.components.attoseconds) / 1e18
    await withCheckedContinuation { done in
      DispatchQueue.global().asyncAfter(deadline: .now() + seconds) { done.resume() }
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

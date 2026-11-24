import Foundation
import Testing

@testable import ConvexMobile
@testable import ShelvrKit
@testable import UniFFI

final class ReconnectingFFI: UniFFI.MobileConvexClientProtocol, @unchecked Sendable {
  private let lock = NSLock()
  nonisolated(unsafe) private var provider: (any AuthTokenProvider)?

  func action(name: String, args: [String: String]) async throws -> String { "null" }
  func mutation(name: String, args: [String: String]) async throws -> String { "null" }
  func query(name: String, args: [String: String]) async throws -> String { "null" }
  func setAuth(token: String?) async throws {}
  func subscribe(name: String, args: [String: String], subscriber: any UniFFI.QuerySubscriber)
    async throws -> UniFFI.SubscriptionHandle
  { fatalError("not used") }

  func setAuthCallback(provider: (any AuthTokenProvider)?) async throws {
    lock.withLock { self.provider = provider }
    _ = try await provider?.fetchToken(forceRefresh: false)
  }

  func reconnect() async throws -> String? {
    let provider = lock.withLock { self.provider }
    return try await provider?.fetchToken(forceRefresh: true)
  }
}

struct ConvexReconnectTests {
  let clock = Clock()

  func connected(_ transport: FakeTransport) async throws -> ReconnectingFFI {
    let auth = AuthSession(transport: transport, vault: MemoryVault(), now: { [clock] in clock.now })
    try await auth.signIn(.anonymous)
    let ffi = ReconnectingFFI()
    let client = ConvexClientWithAuth(ffiClient: ffi, authProvider: SessionAuthProvider(session: auth))
    guard case .success = await client.login() else { throw AuthSessionError.notSignedIn }
    return ffi
  }

  @Test func reconnectsKeepAFreshTokenWithoutAskingTheBackend() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("a")))], delay: .seconds(1))
    let ffi = try await connected(transport)
    clock.advance(120)
    for _ in 0..<4 {
      let started = ContinuousClock.now
      #expect(try await ffi.reconnect() == tokens("a").token)
      #expect(ContinuousClock.now - started < .milliseconds(200))
      clock.advance(25)
    }
    #expect(transport.requests == [SignInRequest(provider: "anonymous")])
  }

  @Test func twoQuickReconnectsWithTheSameOldTokenRefreshIt() async throws {
    let transport = FakeTransport([
      .respond(SignInResponse(tokens: tokens("a"))),
      .respond(SignInResponse(tokens: tokens("b"))),
    ])
    let ffi = try await connected(transport)
    clock.advance(120)
    #expect(try await ffi.reconnect() == tokens("a").token)
    clock.advance(1)
    #expect(try await ffi.reconnect() == tokens("b").token)
    #expect(transport.requests.last == SignInRequest(refreshToken: "refresh-a"))
  }

  @Test func aFlappingConnectionRefreshesAtMostOncePerMinute() async throws {
    let transport = FakeTransport([
      .respond(SignInResponse(tokens: tokens("a"))),
      .respond(SignInResponse(tokens: tokens("b"))),
      .respond(SignInResponse(tokens: tokens("c"))),
    ])
    let ffi = try await connected(transport)
    clock.advance(120)
    for _ in 0..<60 {
      _ = try await ffi.reconnect()
      clock.advance(1)
    }
    #expect(transport.requests.count == 2)
    clock.advance(60)
    _ = try await ffi.reconnect()
    clock.advance(1)
    #expect(try await ffi.reconnect() == tokens("c").token)
    #expect(transport.requests.count == 3)
  }

  @Test func aClockSetBackDoesNotKeepARefusedToken() async throws {
    let transport = FakeTransport([
      .respond(SignInResponse(tokens: tokens("a"))),
      .respond(SignInResponse(tokens: tokens("b"))),
    ])
    let ffi = try await connected(transport)
    clock.advance(-3600)
    #expect(try await ffi.reconnect() == tokens("a").token)
    clock.advance(1)
    #expect(try await ffi.reconnect() == tokens("b").token)
  }
}

import Foundation
import Testing

@testable import ShelvrKit

struct AuthSessionTests {
  let clock = Clock()
  let vault = MemoryVault()

  func session(_ transport: FakeTransport) -> AuthSession {
    AuthSession(transport: transport, vault: vault, now: { [clock] in clock.now })
  }

  @Test func signInStoresTokensAndServesThemWithoutRefreshing() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("a")))])
    let auth = session(transport)
    try await auth.signIn(.anonymous)
    #expect(vault.tokens == tokens("a"))
    #expect(try await auth.validToken() == tokens("a").token)
    #expect(transport.requests == [SignInRequest(provider: "anonymous")])
  }

  @Test func refreshesOnceTheTokenNearsTheEndOfItsLifetime() async throws {
    let transport = FakeTransport([
      .respond(SignInResponse(tokens: tokens("a"))),
      .respond(SignInResponse(tokens: tokens("b"))),
    ])
    let auth = session(transport)
    try await auth.signIn(.anonymous)
    clock.advance(3600 - 299)
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests.last == SignInRequest(refreshToken: "refresh-a"))
    #expect(vault.tokens == tokens("b"))
  }

  @Test func storedTokensAreRefreshedBeforeFirstUse() async throws {
    vault.write(tokens("a"))
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    #expect(try await session(transport).validToken() == tokens("b").token)
  }

  @Test func concurrentCallersShareOneRefresh() async throws {
    vault.write(tokens("a"))
    let transport = FakeTransport(
      [.respond(SignInResponse(tokens: tokens("b")))], delay: .milliseconds(50))
    let auth = session(transport)
    async let first = auth.validToken()
    async let second = auth.validToken()
    #expect(try await [first, second] == [tokens("b").token, tokens("b").token])
    #expect(transport.requests.count == 1)
  }

  @Test func refusedRefreshSignsOut() async throws {
    vault.write(tokens("a"))
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]))
    #expect(try await auth.validToken() == nil)
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == nil)
  }

  @Test func offlineRefreshFallsBackToTheStoredTokenAndKeepsTheSession() async throws {
    vault.write(tokens("a"))
    let auth = session(FakeTransport([.fail]))
    #expect(try await auth.validToken() == tokens("a").token)
    #expect(vault.tokens == tokens("a"))
  }

  @Test func importingALegacyRefreshTokenExchangesItAndForgetsIt() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let legacy = LegacyStore("legacy")
    let auth = session(transport)
    await auth.importLegacy(from: legacy)
    #expect(transport.requests == [SignInRequest(refreshToken: "legacy")])
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(legacy.refreshToken() == nil)
  }

  @Test func importingADeadLegacyTokenForgetsItAndLeavesNoSession() async throws {
    let legacy = LegacyStore("legacy")
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]))
    await auth.importLegacy(from: legacy)
    #expect(vault.tokens == nil)
    #expect(await auth.isSignedIn == false)
    #expect(legacy.refreshToken() == nil)
  }

  @Test func importingWhileOfflineKeepsTheLegacyTokenForTheNextTry() async throws {
    let legacy = LegacyStore("legacy")
    let auth = session(FakeTransport([.fail]))
    await auth.importLegacy(from: legacy)
    #expect(legacy.refreshToken() == "legacy")
    #expect(vault.tokens?.refreshToken == "legacy")
    await #expect(throws: FakeTransport.Offline.self) { try await auth.validToken() }
  }

  @Test func importingWithNoLegacyTokenSendsNothing() async {
    let transport = FakeTransport([])
    await session(transport).importLegacy(from: LegacyStore(nil))
    #expect(transport.requests.isEmpty)
  }

  @Test func signOutForgetsTheSession() async throws {
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: tokens("a")))]))
    try await auth.signIn(.anonymous)
    await auth.signOut()
    #expect(vault.tokens == nil)
    #expect(try await auth.validToken() == nil)
  }

  @Test func refusedSignInThrows() async {
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]))
    await #expect(throws: AuthSessionError.signInRefused) { try await auth.signIn(.anonymous) }
  }

  @Test func startOAuthReturnsTheProviderPageAndVerifier() async throws {
    let transport = FakeTransport([
      .respond(SignInResponse(redirect: "https://accounts.example/auth", verifier: "v1"))
    ])
    let start = try await session(transport).startOAuth(
      provider: "google", redirectTo: URL(string: "shelvr-dev://auth/callback")!)
    #expect(start == OAuthStart(url: URL(string: "https://accounts.example/auth")!, verifier: "v1"))
    #expect(
      transport.requests == [
        SignInRequest(provider: "google", params: ["redirectTo": "shelvr-dev://auth/callback"])
      ])
  }

  @Test func credentialsBecomeTheBackendSignInRequests() {
    #expect(
      SignInCredential.apple(identityToken: "id", nonce: "n", name: "", authorizationCode: "c")
        .request
        == SignInRequest(
          provider: "apple-native",
          params: ["identityToken": "id", "nonce": "n", "authorizationCode": "c"]))
    #expect(
      SignInCredential.oauthCode(provider: "google", code: "c", verifier: "v").request
        == SignInRequest(provider: "google", params: ["code": "c"], verifier: "v"))
  }
}

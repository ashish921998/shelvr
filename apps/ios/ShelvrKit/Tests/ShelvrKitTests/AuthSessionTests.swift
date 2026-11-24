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

  @Test func signingOutDuringARefreshKeepsEveryCallerSignedOut() async throws {
    vault.write(tokens("a"))
    let gate = Gate()
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))], gate: gate)
    let auth = session(transport)
    async let first = try? auth.validToken()
    try await eventually { transport.requests.count == 1 }
    async let second = try? auth.validToken()
    await auth.signOut()
    gate.open()
    #expect(await [first, second] == [String?.none, String?.none])
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == nil)
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

  @Test func importingMovesTheExpoTokenIntoTheVaultBeforeExchangingIt() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let legacy = LegacyStore("legacy")
    let auth = session(transport)
    await auth.importLegacy(from: legacy)
    #expect(vault.tokens == AuthTokens(token: "", refreshToken: "legacy"))
    #expect(legacy.refreshToken() == nil)
    #expect(transport.requests.isEmpty)
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "legacy")])
    #expect(vault.tokens == tokens("b"))
  }

  @Test func importingADeadLegacyTokenLeavesNoSession() async throws {
    let legacy = LegacyStore("legacy")
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]))
    await auth.importLegacy(from: legacy)
    #expect(try await auth.validToken() == nil)
    #expect(vault.tokens == nil)
    #expect(await auth.isSignedIn == false)
    #expect(legacy.refreshToken() == nil)
  }

  @Test func anOfflineImportExchangesTheTokenFromTheVaultOnTheNextLaunch() async throws {
    let legacy = LegacyStore("legacy")
    let transport = FakeTransport([.fail, .respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport)
    await auth.importLegacy(from: legacy)
    await #expect(throws: FakeTransport.Offline.self) { try await auth.validToken() }
    let relaunched = session(transport)
    await relaunched.importLegacy(from: legacy)
    #expect(try await relaunched.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "legacy"), SignInRequest(refreshToken: "legacy")])
  }

  @Test func anExpoSignInNewerThanTheNativeSessionReplacesIt() async throws {
    vault.write(tokens("old"))
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport)
    await auth.importLegacy(from: LegacyStore("expo"))
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "expo")])
  }

  @Test func anUnfinishedImportGivesWayToANewerExpoToken() async throws {
    let transport = FakeTransport([.fail, .respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport)
    await auth.importLegacy(from: LegacyStore("expo-1"))
    await #expect(throws: FakeTransport.Offline.self) { try await auth.validToken() }
    let relaunched = session(transport)
    await relaunched.importLegacy(from: LegacyStore("expo-3"))
    #expect(try await relaunched.validToken() == tokens("b").token)
    #expect(transport.requests.last == SignInRequest(refreshToken: "expo-3"))
  }

  @Test func aVaultThatCannotSaveLeavesTheExpoTokenAndTheSessionAlone() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let legacy = LegacyStore("expo")
    let auth = AuthSession(transport: transport, vault: ReadOnlyVault(tokens: tokens("a")))
    await auth.importLegacy(from: legacy)
    #expect(legacy.refreshToken() == "expo")
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "refresh-a")])
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

  @Test func signingOutClearsTheSessionBeforeTellingTheServer() async throws {
    let gate = Gate()
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("a")))], signOutGate: gate)
    let auth = session(transport)
    try await auth.signIn(.anonymous)
    async let signedOut: Void = auth.signOut()
    try await eventually { transport.signOuts.count == 1 }
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == nil)
    gate.open()
    await signedOut
    #expect(transport.signOuts == [tokens("a").token])
  }

  @Test func aSignInWhileTheServerSignsOutKeepsTheNewSession() async throws {
    let gate = Gate()
    let transport = FakeTransport(
      [.respond(SignInResponse(tokens: tokens("a"))), .respond(SignInResponse(tokens: tokens("b")))],
      signOutGate: gate)
    let auth = session(transport)
    try await auth.signIn(.anonymous)
    async let signedOut: Void = auth.signOut()
    try await eventually { transport.signOuts.count == 1 }
    try await auth.signIn(.anonymous)
    gate.open()
    await signedOut
    #expect(vault.tokens == tokens("b"))
    #expect(await auth.isSignedIn)
  }

  @Test func signingOutBeforeTheFirstExchangeTellsTheServerNothing() async {
    let transport = FakeTransport([])
    let auth = session(transport)
    await auth.importLegacy(from: LegacyStore("legacy"))
    await auth.signOut()
    #expect(vault.tokens == nil)
    #expect(transport.signOuts.isEmpty)
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

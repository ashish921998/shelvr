import Foundation
import Testing

@testable import ShelvrKit

struct AuthSessionTests {
  let clock = Clock()
  let vault = MemoryVault()

  func session(_ transport: FakeTransport, legacy: LegacyStore? = nil) -> AuthSession {
    AuthSession(transport: transport, vault: vault, legacy: legacy, now: { [clock] in clock.now })
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
    let auth = session(transport)
    await auth.restore()
    #expect(try await auth.validToken() == tokens("b").token)
  }

  @Test func concurrentCallersShareOneRefresh() async throws {
    vault.write(tokens("a"))
    let transport = FakeTransport(
      [.respond(SignInResponse(tokens: tokens("b")))], delay: .milliseconds(50))
    let auth = session(transport)
    await auth.restore()
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
    await auth.restore()
    async let first = try? auth.validToken()
    try await eventually { transport.requests.count == 1 }
    async let second = try? auth.validToken()
    try await Task.sleep(for: .milliseconds(10))
    try await auth.signOut()
    gate.open()
    #expect(await [first, second] == [String?.none, String?.none])
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == nil)
    #expect(transport.requests.count == 1)
  }

  @Test func refusedRefreshSignsOut() async throws {
    vault.write(tokens("a"))
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]))
    await auth.restore()
    #expect(try await auth.validToken() == nil)
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == nil)
  }

  @Test func offlineRefreshFallsBackToTheStoredTokenAndKeepsTheSession() async throws {
    vault.write(tokens("a"))
    let auth = session(FakeTransport([.fail]))
    await auth.restore()
    #expect(try await auth.validToken() == tokens("a").token)
    #expect(vault.tokens == tokens("a"))
  }

  @Test func importingMovesTheExpoTokenIntoTheVaultBeforeExchangingIt() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let legacy = LegacyStore("legacy")
    let auth = session(transport, legacy: legacy)
    await auth.restore()
    #expect(vault.tokens == AuthTokens(token: "", refreshToken: "legacy"))
    #expect(legacy.refreshToken() == nil)
    #expect(transport.requests.isEmpty)
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "legacy")])
    #expect(vault.tokens == tokens("b"))
  }

  @Test func importingADeadLegacyTokenLeavesNoSession() async throws {
    let legacy = LegacyStore("legacy")
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: nil))]), legacy: legacy)
    await auth.restore()
    #expect(try await auth.validToken() == nil)
    #expect(vault.tokens == nil)
    #expect(await auth.isSignedIn == false)
    #expect(legacy.refreshToken() == nil)
  }

  @Test func anOfflineImportExchangesTheTokenFromTheVaultOnTheNextLaunch() async throws {
    let legacy = LegacyStore("legacy")
    let transport = FakeTransport([.fail, .respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport, legacy: legacy)
    await auth.restore()
    await #expect(throws: FakeTransport.Offline.self) { try await auth.validToken() }
    let relaunched = session(transport, legacy: legacy)
    await relaunched.restore()
    #expect(try await relaunched.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "legacy"), SignInRequest(refreshToken: "legacy")])
  }

  @Test func anExpoSignInNewerThanTheNativeSessionReplacesIt() async throws {
    vault.write(tokens("old"))
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport, legacy: LegacyStore("expo"))
    await auth.restore()
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "expo")])
  }

  @Test func anUnfinishedImportGivesWayToANewerExpoToken() async throws {
    let transport = FakeTransport([.fail, .respond(SignInResponse(tokens: tokens("b")))])
    let auth = session(transport, legacy: LegacyStore("expo-1"))
    await auth.restore()
    await #expect(throws: FakeTransport.Offline.self) { try await auth.validToken() }
    let relaunched = session(transport, legacy: LegacyStore("expo-3"))
    await relaunched.restore()
    #expect(try await relaunched.validToken() == tokens("b").token)
    #expect(transport.requests.last == SignInRequest(refreshToken: "expo-3"))
  }

  @Test func aVaultThatCannotSaveLeavesTheExpoTokenAndTheSessionAlone() async throws {
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("b")))])
    let legacy = LegacyStore("expo")
    let auth = AuthSession(transport: transport, vault: ReadOnlyVault(tokens: tokens("a")), legacy: legacy)
    await auth.restore()
    #expect(legacy.refreshToken() == "expo")
    #expect(try await auth.validToken() == tokens("b").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "refresh-a")])
  }

  @Test func importingWithNoLegacyTokenSendsNothing() async {
    let transport = FakeTransport([])
    await session(transport, legacy: LegacyStore(nil)).restore()
    #expect(transport.requests.isEmpty)
  }

  @Test func signOutForgetsTheSession() async throws {
    let auth = session(FakeTransport([.respond(SignInResponse(tokens: tokens("a")))]))
    try await auth.signIn(.anonymous)
    try await auth.signOut()
    #expect(vault.tokens == nil)
    #expect(try await auth.validToken() == nil)
  }

  @Test(arguments: [(false, true), (true, false), (false, false)])
  func offlineSignOutSurvivesRelaunchWhenKeychainCleanupFails(
    canDeleteNative: Bool, canDeleteLegacy: Bool
  ) async throws {
    let marker = temporarySignOutMarker()
    defer { try? marker.clear() }
    let vault = MemoryVault(tokens("a"), canDelete: canDeleteNative)
    let legacy = LegacyStore(nil, canForget: canDeleteLegacy)
    let expoAtRelaunch = LegacyStore("expo", canForget: canDeleteLegacy)
    let transport = FakeTransport([], failSignOut: true)
    let auth = AuthSession(transport: transport, vault: vault, legacy: legacy, signOutMarker: marker)
    await auth.restore()
    #expect(await auth.isSignedIn)
    try await auth.signOut()
    #expect(await auth.isSignedIn == false)
    #expect(transport.signOuts == [tokens("a").token])
    #expect(marker.state == .pending)

    let relaunched = AuthSession(transport: transport, vault: vault, legacy: expoAtRelaunch, signOutMarker: marker)
    await relaunched.restore()
    #expect(await relaunched.isSignedIn == false)
    #expect(try await relaunched.validToken() == nil)
    #expect(transport.requests.isEmpty)
  }

  @Test func pendingSignOutIsClearedOnceBothCopiesAreDeleted() async throws {
    let marker = temporarySignOutMarker()
    defer { try? marker.clear() }
    try marker.record()
    let vault = MemoryVault(tokens("old"))
    let legacy = LegacyStore("old-expo")
    let transport = FakeTransport([])
    let auth = AuthSession(transport: transport, vault: vault, legacy: legacy, signOutMarker: marker)
    await auth.restore()
    #expect(marker.state == .absent)
    #expect(vault.tokens == nil)
    #expect(legacy.refreshToken() == nil)
    #expect(await auth.isSignedIn == false)
    #expect(transport.requests.isEmpty)
  }

  @Test func explicitSignInCanPersistANewSessionAfterAnOfflineSignOut() async throws {
    let marker = temporarySignOutMarker()
    defer { try? marker.clear() }
    let vault = MemoryVault(tokens("old"), canDelete: false)
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("new")))], failSignOut: true)
    let auth = AuthSession(transport: transport, vault: vault, signOutMarker: marker)
    await auth.restore()
    try await auth.signOut()
    #expect(marker.state == .pending)

    try await auth.signIn(.anonymous)
    #expect(marker.state == .absent)
    #expect(vault.tokens == tokens("new"))
    let relaunched = AuthSession(transport: transport, vault: vault, signOutMarker: marker)
    await relaunched.restore()
    #expect(await relaunched.isSignedIn)
  }

  @Test func inaccessibleSignOutMarkerLeavesSavedCredentialsIntact() async throws {
    let marker = temporarySignOutMarker()
    try FileManager.default.createDirectory(at: marker.url, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: marker.url) }
    let vault = MemoryVault(tokens("old"))
    let transport = FakeTransport([.respond(SignInResponse(tokens: tokens("refreshed")))])
    let auth = AuthSession(transport: transport, vault: vault, signOutMarker: marker)
    await auth.restore()
    #expect(await auth.isSignedIn == false)
    #expect(vault.tokens == tokens("old"))

    try FileManager.default.removeItem(at: marker.url)
    await auth.restore()
    #expect(try await auth.validToken() == tokens("refreshed").token)
    #expect(transport.requests == [SignInRequest(refreshToken: "refresh-old")])
  }

  @Test func aRefusedSessionStaysSignedOutWhenItsKeychainCopyCannotBeDeleted() async throws {
    let marker = temporarySignOutMarker()
    defer { try? marker.clear() }
    let vault = MemoryVault(tokens("a"), canDelete: false)
    let transport = FakeTransport([.respond(SignInResponse(tokens: nil)), .fail])
    let auth = AuthSession(transport: transport, vault: vault, signOutMarker: marker)
    await auth.restore()
    #expect(try await auth.validToken() == nil)

    await auth.restore()
    #expect(try await auth.validToken() == nil)
    #expect(await auth.isSignedIn == false)
    let relaunched = AuthSession(transport: transport, vault: vault, signOutMarker: marker)
    await relaunched.restore()
    #expect(await relaunched.isSignedIn == false)
    #expect(transport.requests.count == 1)
  }

  private func temporarySignOutMarker() -> SignOutMarker {
    SignOutMarker(url: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString))
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
    try await signedOut
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
    try await signedOut
    #expect(vault.tokens == tokens("b"))
    #expect(await auth.isSignedIn)
  }

  @Test func signingOutBeforeTheFirstExchangeTellsTheServerNothing() async throws {
    let transport = FakeTransport([])
    let auth = session(transport, legacy: LegacyStore("legacy"))
    await auth.restore()
    try await auth.signOut()
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

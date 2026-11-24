import ConvexMobile
import Foundation
import Testing

@testable import ShelvrKit

private let liveURL = ProcessInfo.processInfo.environment["SHELVR_LIVE_CONVEX_URL"]

@Suite(.enabled(if: liveURL != nil, "set SHELVR_LIVE_CONVEX_URL to a dev deployment"))
struct LiveDevTests {
  struct CurrentUser: Decodable { let _id: String }

  @Test func anonymousSessionRefreshesAndAuthenticatesLiveQueries() async throws {
    let environment = try AppEnvironment(variant: .development, convexURL: URL(string: liveURL!)!)
    let clock = Clock()
    let vault = MemoryVault()
    let session = AuthSession(
      transport: ConvexHTTPAuthTransport(deployment: environment.convexURL),
      vault: vault, now: { [clock] in clock.now })
    try await session.signIn(.anonymous)
    let first = try #require(vault.tokens)

    clock.advance(3600)
    #expect(try await session.validToken() != nil)
    #expect(vault.tokens?.refreshToken != first.refreshToken)

    let client = ConvexClientWithAuth(
      deploymentUrl: environment.convexURL.absoluteString,
      authProvider: SessionAuthProvider(session: session))
    guard case .success = await client.login() else {
      Issue.record("login failed")
      return
    }
    let user = try await client.subscribe(to: "users:getCurrentUser", yielding: CurrentUser?.self)
      .values.first { $0 != nil }
    #expect(user??._id.isEmpty == false)
  }

  @Test func signingOutEndsTheSessionOnTheServer() async throws {
    let environment = try AppEnvironment(variant: .development, convexURL: URL(string: liveURL!)!)
    let transport = ConvexHTTPAuthTransport(deployment: environment.convexURL)
    let vault = MemoryVault()
    let session = AuthSession(transport: transport, vault: vault)
    try await session.signIn(.anonymous)
    let signedIn = try #require(vault.tokens)
    await session.signOut()
    let reply = try await transport.signIn(SignInRequest(refreshToken: signedIn.refreshToken))
    #expect(reply.tokens == nil)
  }
}

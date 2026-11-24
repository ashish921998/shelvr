import Combine
import ConvexMobile
import Foundation
import Synchronization
import Testing

@testable import ShelvrKit

private let soakMinutes = ProcessInfo.processInfo.environment["SHELVR_SOAK_MINUTES"].flatMap(Double.init)
private let soakURL = ProcessInfo.processInfo.environment["SHELVR_LIVE_CONVEX_URL"]

@Suite(.enabled(if: soakMinutes != nil && soakURL != nil, "set SHELVR_SOAK_MINUTES and SHELVR_LIVE_CONVEX_URL"))
struct LiveSoakTests {
  struct Preferences: Decodable { let weeklyShelfEnabled: Bool }
  struct CurrentUser: Decodable { let _id: String }

  final class Counting: AuthTransport {
    let inner: any AuthTransport
    let refreshes = Mutex(0)
    init(_ inner: any AuthTransport) { self.inner = inner }
    func signIn(_ request: SignInRequest) async throws -> SignInResponse {
      if request.refreshToken != nil { refreshes.withLock { $0 += 1 } }
      return try await inner.signIn(request)
    }
    func signOut(token: String) async throws { try await inner.signOut(token: token) }
  }

  @Test(.timeLimit(.minutes(120)))
  func liveQueriesSurviveTheTokenExpiring() async throws {
    let environment = try AppEnvironment(variant: .development, convexURL: URL(string: soakURL!)!, bundleID: "app.shelvr.save.preview")
    let transport = Counting(ConvexHTTPAuthTransport(deployment: environment.convexURL))
    let session = AuthSession(transport: transport, vault: MemoryVault())
    try await session.signIn(.anonymous)
    let client = ConvexClientWithAuth(
      deploymentUrl: environment.convexURL.absoluteString,
      authProvider: SessionAuthProvider(session: session))
    guard case .success = await client.login() else {
      Issue.record("login failed")
      return
    }

    let users = Mutex<[String?]>([])
    let preferences = Mutex<[Bool]>([])
    let failures = Mutex<[String]>([])
    var bag = Set<AnyCancellable>()
    client.subscribe(to: "users:getCurrentUser", yielding: CurrentUser?.self)
      .sink(
        receiveCompletion: { completion in failures.withLock { $0.append("user \(completion)") } },
        receiveValue: { user in users.withLock { $0.append(user?._id) } }
      ).store(in: &bag)
    client.subscribe(to: "notifications:getPreferences", yielding: Preferences.self)
      .sink(
        receiveCompletion: { completion in failures.withLock { $0.append("prefs \(completion)") } },
        receiveValue: { prefs in preferences.withLock { $0.append(prefs.weeklyShelfEnabled) } }
      ).store(in: &bag)

    try await Task.sleep(for: .seconds(soakMinutes! * 60))

    let flipped = !(preferences.withLock { $0.last } ?? true)
    try await client.mutation("notifications:setPreferences", with: ["weeklyShelfEnabled": flipped])
    try await Task.sleep(for: .seconds(15))

    print("soak refreshes:", transport.refreshes.withLock { $0 }, "users:", users.withLock { $0 }, "prefs:", preferences.withLock { $0 }, "failures:", failures.withLock { $0 })
    #expect(failures.withLock { $0 }.isEmpty)
    #expect(users.withLock { $0.last } != nil)
    #expect(users.withLock { $0 }.contains(nil) == false)
    #expect(preferences.withLock { $0.last } == flipped)
    #expect(transport.refreshes.withLock { $0 } >= 1)
    _ = bag
  }
}

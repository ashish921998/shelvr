import Combine
import ConvexMobile
import Foundation
import Observation

@MainActor @Observable
public final class Backend {
  public enum Status: Sendable, Equatable {
    case starting
    case signedOut
    case signedIn
    case offline
  }

  public private(set) var status = Status.starting
  public let environment: AppEnvironment
  public let client: ConvexClientWithAuth<String>
  private let session: AuthSession
  private let legacy: LegacyExpoSession
  @ObservationIgnored private var authWatch: AnyCancellable?
  @ObservationIgnored private var starting: Task<Void, Never>?

  public init(environment: AppEnvironment) {
    let session = AuthSession(
      transport: ConvexHTTPAuthTransport(deployment: environment.convexURL),
      vault: KeychainTokenVault())
    self.environment = environment
    self.session = session
    self.legacy = LegacyExpoSession(convexURL: environment.convexURL)
    self.client = ConvexClientWithAuth(
      deploymentUrl: environment.convexURL.absoluteString,
      authProvider: SessionAuthProvider(session: session))
    authWatch = client.authState
      .receive(on: DispatchQueue.main)
      .sink { [weak self] state in
        MainActor.assumeIsolated {
          guard let self, self.status == .signedIn, case .unauthenticated = state else { return }
          self.status = .signedOut
        }
      }
  }

  public func start() async {
    if let starting { return await starting.value }
    let task = Task { await resume() }
    starting = task
    await task.value
    starting = nil
  }

  private func resume() async {
    guard status != .signedIn else { return }
    await session.importLegacy(from: legacy)
    guard await session.isSignedIn else {
      status = .signedOut
      return
    }
    await connect()
  }

  public func signIn(_ credential: SignInCredential) async throws {
    try await session.signIn(credential)
    legacy.forget()
    await connect()
  }

  public func startOAuth(provider: String) async throws -> OAuthStart {
    try await session.startOAuth(provider: provider, redirectTo: environment.oauthRedirect)
  }

  public func signOut() async {
    try? await client.action("auth:signOut")
    await session.signOut()
    legacy.forget()
    await client.logout()
    status = .signedOut
  }

  public func query<T: Decodable>(_ name: String, as type: T.Type) -> some AsyncSequence<T, any Error> {
    client.subscribe(to: name, yielding: type).values
  }

  private func connect() async {
    switch await client.loginFromCache() {
    case .success: status = .signedIn
    case .failure: status = await session.isSignedIn ? .offline : .signedOut
    }
  }
}

final class SessionAuthProvider: AuthProvider, Sendable {
  let session: AuthSession

  init(session: AuthSession) {
    self.session = session
  }

  func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    try await loginFromCache(onIdToken: onIdToken)
  }

  func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    guard let token = try await session.validToken() else {
      onIdToken(nil)
      throw AuthSessionError.notSignedIn
    }
    return token
  }

  func logout() async throws {}

  func extractIdToken(from authResult: String) -> String { authResult }
}

extension ConvexClient: @retroactive @unchecked Sendable {}

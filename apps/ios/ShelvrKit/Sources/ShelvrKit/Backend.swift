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
  @ObservationIgnored private var authWatch: AnyCancellable?
  @ObservationIgnored private var starting: Task<Void, Never>?
  @ObservationIgnored private var signingOut = false
  @ObservationIgnored var preparingSiri: (subject: String, task: Task<Void, Error>)?
  @ObservationIgnored var siriDrain: Task<Void, Never>?
  @ObservationIgnored var siriDrainRequested = false
  @ObservationIgnored var siriBacklog = SiriRevocationBacklog()

  public init(environment: AppEnvironment) {
    let session = AuthSession(
      transport: ConvexHTTPAuthTransport(deployment: environment.convexURL),
      vault: KeychainTokenVault(),
      signOutMarker: SignOutMarker(url: URL.applicationSupportDirectory.appending(path: "pending-sign-out")))
    self.environment = environment
    self.session = session
    self.client = ConvexClientWithAuth(
      deploymentUrl: environment.convexURL.absoluteString,
      authProvider: SessionAuthProvider(session: session))
    authWatch = client.authState
      .receive(on: DispatchQueue.main)
      .sink { [weak self] state in
        MainActor.assumeIsolated {
          guard let self, self.status == .signedIn, !self.signingOut,
            case .unauthenticated = state
          else { return }
          self.status = .signedOut
        }
      }
  }

  public func start() async {
    retrySiriRevocations()
    if let starting { return await starting.value }
    let task = Task { await resume() }
    starting = task
    await task.value
    starting = nil
  }

  private func resume() async {
    guard status != .signedIn else { return }
    await session.restore()
    guard await session.isSignedIn else {
      if KeychainTokenVault().isAbsent, let old = SiriCredential.stored() { retireSiri(old) }
      retrySiriRevocations()
      status = .signedOut
      return
    }
    await connect()
  }

  public func signIn(_ credential: SignInCredential) async throws {
    try await session.signIn(credential)
    await connect()
  }

  public func startOAuth(provider: String) async throws -> OAuthStart {
    try await session.startOAuth(provider: provider, redirectTo: environment.oauthRedirect)
  }

  public func signOut() async throws {
    guard status == .signedIn, !signingOut else { return }
    signingOut = true
    let siri = SiriCredential.current()
    if let siri, siri.siteURL == siriRevocations?.site.absoluteString { rememberSiriRevocation(siri.token) }
    let authorization = KeychainTokenVault().read()?.token
    do {
      try await session.signOut {
        if let siri { await self.retireSiri(siri) }
        await self.disconnect()
        if let siri, let authorization,
          siri.siteURL == SiriRevocations.site(for: self.environment.convexURL)?.absoluteString,
          JWT.claims(of: authorization)?.sub == siri.subject {
          await self.revokeSiriToken(siri.token, authorization: authorization)
        } else { await self.retrySiriRevocations() }
      }
    } catch {
      signingOut = false
      throw error
    }
  }

  private func retireSiri(_ credential: SiriCredential) {
    do {
      try credential.enqueueRevocation()
      credential.removeIfCurrent()
    } catch {}
  }

  private func disconnect() async {
    await client.logout()
    status = .signedOut
    signingOut = false
  }

  public func query<T: Decodable>(_ name: String, with args: [String: ConvexEncodable?] = [:], as type: T.Type) -> some AsyncSequence<T, any Error> {
    client.subscribe(to: name, with: args, yielding: type).values
  }

  private func connect() async {
    switch await client.login() {
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
    try await token(reconnecting: false, onIdToken: onIdToken)
  }

  func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    try await token(reconnecting: true, onIdToken: onIdToken)
  }

  private func token(reconnecting: Bool, onIdToken: @Sendable (String?) -> Void) async throws -> String {
    guard let token = try await session.validToken(reconnecting: reconnecting) else {
      onIdToken(nil)
      throw AuthSessionError.notSignedIn
    }
    return token
  }

  func logout() async throws {}

  func extractIdToken(from authResult: String) -> String { authResult }
}

extension ConvexClient: @retroactive @unchecked Sendable {}

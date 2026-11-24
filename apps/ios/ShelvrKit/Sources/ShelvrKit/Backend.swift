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

  public private(set) var sessionGeneration = UUID()
  public private(set) var status = Status.starting {
    didSet { if status != oldValue { sessionGeneration = UUID() } }
  }
  public let environment: AppEnvironment
  public let client: ConvexClientWithAuth<String>
  private let session: AuthSession
  @ObservationIgnored private var authWatch: AnyCancellable?
  @ObservationIgnored private var starting: Task<Void, Never>?
  @ObservationIgnored private let deletion = AccountDeletion()
  @ObservationIgnored private var registeringPush: Task<Void, Error>?
  private var signingOut = false
  private var connectedUserID: String?
  @ObservationIgnored private var signingIn = false

  public var userID: String? { status == .signedIn && !signingOut && !deletion.isRunning ? connectedUserID : nil }

  public convenience init(environment: AppEnvironment) {
    let session = AuthSession(
      transport: ConvexHTTPAuthTransport(deployment: environment.convexURL),
      vault: KeychainTokenVault(),
      signOutMarker: SignOutMarker(url: URL.applicationSupportDirectory.appending(path: "pending-sign-out")))
    self.init(environment: environment, session: session)
  }

  init(environment: AppEnvironment, session: AuthSession) {
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
          self.connectedUserID = nil
          self.status = .signedOut
        }
      }
  }

  public func start() async {
    await deletion.wait()
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
      status = .signedOut
      return
    }
    await connect()
  }

  public func signIn(_ credential: SignInCredential) async throws {
    await deletion.wait()
    guard status == .signedOut, !signingIn else { throw AuthSessionError.signInRefused }
    signingIn = true
    defer { signingIn = false }
    try await session.signIn(credential)
    await connect()
  }

  public func startOAuth(provider: String) async throws -> OAuthStart {
    await deletion.wait()
    return try await session.startOAuth(provider: provider, redirectTo: environment.oauthRedirect)
  }

  private var pushTokens: PushTokenStore { PushTokenStore(serviceURL: environment.convexURL) }

  public func registerPush(_ token: String, native: Data, installation: PushInstallation, locale: String, generation: UUID) async throws {
    guard mayRegisterPush(generation) else { throw CancellationError() }
    let previous = registeringPush
    let task = Task {
      _ = await previous?.result
      guard let bearer = try await session.validToken() else { throw AuthSessionError.notSignedIn }
      guard mayRegisterPush(generation) else { throw CancellationError() }
      let identity = try PushTokenStore.registrationID(bearer: bearer, installSecret: installation.secret)
      try await pushTokens.registerFresh(token, native: native, for: identity) { record in
        try await registerInstallation(record, installation: installation, locale: locale, bearer: bearer)
      } unregister: { old in
        try await unregisterInstallation(old, installation: installation)
      }
    }
    registeringPush = task
    try await task.value
  }

  public func mayRegisterPush(_ generation: UUID) -> Bool {
    status == .signedIn && sessionGeneration == generation && !signingOut && !deletion.isRunning
  }

  public func finishPushRevocation(installation: PushInstallation, generation: UUID,
    suspend: @escaping @MainActor () -> Void) async throws -> Set<String> {
    var verified = Set<String>()
    let previous = registeringPush
    let task = Task {
      _ = await previous?.result
      guard sessionGeneration == generation, status == .signedOut || mayRegisterPush(generation) else {
        throw CancellationError()
      }
      let bearer = status == .signedIn ? try await session.validToken() : nil
      guard sessionGeneration == generation, status == .signedOut || mayRegisterPush(generation) else {
        throw CancellationError()
      }
      if status == .signedIn && bearer == nil { throw AuthSessionError.notSignedIn }
      let identity = try bearer.map { try PushTokenStore.registrationID(bearer: $0, installSecret: installation.secret) }
      try await pushTokens.retireStale(keeping: identity, suspend: suspend) { record in
        try await unregisterInstallation(record, installation: installation)
      }
      if let identity {
        verified = try pushTokens.verifiedAPNSDigests(for: identity)
      }
    }
    registeringPush = task
    try await task.value
    return verified
  }

  private func registerInstallation(_ record: PushRegistrationRecord, installation: PushInstallation, locale: String, bearer: String) async throws {
    try await PushTransport(deployment: environment.convexURL).call("notifications:registerDevice", args: [
      "token": record.token, "installSecret": installation.secret, "registrationId": record.registrationId, "platform": "ios",
      "locale": locale, "timezone": TimeZone.current.identifier
    ], bearer: bearer)
  }

  private func unregisterInstallation(_ record: PushRegistrationRecord, installation: PushInstallation) async throws {
    try await PushTransport(deployment: environment.convexURL).call("notifications:unregisterInstallation", args: [
      "token": record.token, "installSecret": installation.secret, "registrationId": record.registrationId
    ])
  }

  public func signOut() async throws {
    await deletion.wait()
    guard status == .signedIn, !signingOut else { return }
    signingOut = true
    do {
      try await session.signOut { await self.disconnect() }
    } catch {
      signingOut = false
      throw error
    }
  }

  public func deleteAccount() async throws {
    try await deletion.perform(allowed: status == .signedIn && !signingOut) {
      try await self.client.mutation("users:deleteCurrentUserAccount")
    } afterAcceptance: {
      await self.session.forgetDeletedAccount()
      await self.disconnect()
    }
  }

  private func disconnect() async {
    await client.logout()
    connectedUserID = nil
    status = .signedOut
    signingOut = false
  }

  public func query<T: Decodable>(_ name: String, as type: T.Type) -> some AsyncSequence<T, any Error> {
    client.subscribe(to: name, yielding: type).values
  }

  private func connect() async {
    switch await client.login() {
    case let .success(token):
      connectedUserID = AuthTokens.ownerID(for: token)
      status = .signedIn
    case .failure:
      connectedUserID = nil
      status = await session.isSignedIn ? .offline : .signedOut
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

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
  @ObservationIgnored private var deletion: Task<Void, Error>?
  @ObservationIgnored private var registeringPush: Task<Void, Error>?
  @ObservationIgnored private var signingOut = false
  @ObservationIgnored var preparingSiri: (subject: String, task: Task<Void, Error>)?
  @ObservationIgnored var siriDrain: Task<Void, Never>?
  @ObservationIgnored var siriDrainRequested = false
  @ObservationIgnored var siriBacklog = SiriRevocationBacklog()
  @ObservationIgnored private var signingIn = false

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

  public func offlineAccountID() async -> String? {
    guard status == .offline else { return nil }
    return await session.cachedAccountID
  }

  public func start() async {
    if let deletion { _ = await deletion.result }
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

  public func requireShareOwner(_ owner: String) throws {
    guard status == .signedIn, !signingOut, deletion == nil, KeychainTokenVault().read()?.belongs(to: owner) == true
    else { throw CancellationError() }
  }

  public func signIn(_ credential: SignInCredential) async throws {
    if let deletion { _ = await deletion.result }
    guard status == .signedOut, !signingIn else { throw AuthSessionError.signInRefused }
    signingIn = true
    defer { signingIn = false }
    try await session.signIn(credential)
    await connect()
  }

  public func startOAuth(provider: String) async throws -> OAuthStart {
    if let deletion { _ = await deletion.result }
    return try await session.startOAuth(provider: provider, redirectTo: environment.oauthRedirect)
  }

  private var pushTokens: PushTokenStore { PushTokenStore(serviceURL: environment.convexURL) }

  public func registerPush(_ token: String, installation: PushInstallation, locale: String) async throws {
    guard status == .signedIn, !signingOut, deletion == nil else { return }
    let generation = sessionGeneration
    let previous = registeringPush
    let task = Task {
      _ = await previous?.result
      guard let bearer = try await session.validToken(), generation == sessionGeneration,
        status == .signedIn, !signingOut, deletion == nil else { return }
      var tokens = try pushTokens.read()
      let record = PushRegistrationRecord(token: token, registrationId: generation.uuidString)
      if !tokens.contains(record) { tokens.append(record) }
      try pushTokens.write(tokens)
      try await PushTransport(deployment: environment.convexURL).call("notifications:registerDevice", args: [
        "token": token, "installSecret": installation.secret, "registrationId": record.registrationId, "platform": "ios",
        "locale": locale, "timezone": TimeZone.current.identifier
      ], bearer: bearer)
      for old in tokens where old != record {
        try await unregisterInstallation(old, installation: installation)
      }
      try pushTokens.write([record])
    }
    registeringPush = task
    try await task.value
  }

  public func finishPushRevocation(installation: PushInstallation) async throws {
    let generation = sessionGeneration
    let previous = registeringPush
    let task = Task {
      _ = await previous?.result
      guard status == .signedOut, sessionGeneration == generation else { return }
      for token in try pushTokens.read() {
        try await unregisterInstallation(token, installation: installation)
      }
      if status == .signedOut, sessionGeneration == generation { try pushTokens.write([]) }
    }
    registeringPush = task
    try await task.value
  }

  private func unregisterInstallation(_ record: PushRegistrationRecord, installation: PushInstallation) async throws {
    try await PushTransport(deployment: environment.convexURL).call("notifications:unregisterInstallation", args: [
      "token": record.token, "installSecret": installation.secret, "registrationId": record.registrationId
    ])
  }

  public func signOut() async throws {
    if let deletion { _ = await deletion.result }
    guard status == .signedIn, !signingOut else { return }
    signingOut = true
    let siri = SiriCredential.current()
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

  public func deleteAccount() async throws {
    if let deletion { return try await deletion.value }
    guard status == .signedIn, !signingOut else { throw AuthSessionError.notSignedIn }
    let task = Task {
      try await client.mutation("users:deleteCurrentUserAccount")
      await session.forgetDeletedAccount()
      await disconnect()
    }
    deletion = task
    defer { deletion = nil }
    try await task.value
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

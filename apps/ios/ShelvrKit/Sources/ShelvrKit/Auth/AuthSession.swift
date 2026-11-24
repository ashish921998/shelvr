import Foundation

public enum SignInCredential: Sendable, Equatable {
  case apple(identityToken: String, nonce: String, name: String?, authorizationCode: String?)
  case oauthCode(provider: String, code: String, verifier: String)
  case anonymous

  var request: SignInRequest {
    switch self {
    case let .apple(identityToken, nonce, name, authorizationCode):
      var params = ["identityToken": identityToken, "nonce": nonce]
      params["name"] = name.flatMap { $0.isEmpty ? nil : $0 }
      params["authorizationCode"] = authorizationCode
      return SignInRequest(provider: "apple-native", params: params)
    case let .oauthCode(provider, code, verifier):
      return SignInRequest(provider: provider, params: ["code": code], verifier: verifier)
    case .anonymous:
      return SignInRequest(provider: "anonymous")
    }
  }
}

public struct OAuthStart: Sendable, Equatable {
  public let url: URL
  public let verifier: String
}

public enum AuthSessionError: Error, Equatable {
  case notSignedIn
  case signInRefused
  case missingRedirect
  case sessionStorageUnavailable
}

actor AuthSession {
  private let transport: any AuthTransport
  private let vault: any TokenVault
  private let legacy: (any LegacySessionStore)?
  private let signOutMarker: SignOutMarker?
  private let now: @Sendable () -> Date
  private var waitingForStorage: Bool
  private var tokens: AuthTokens?
  private var freshUntil: Date?
  private var mintedAt: Date?
  private var refresh: Task<AuthTokens?, Error>?
  private var lastReconnect: (token: String, at: Date)?

  init(
    transport: any AuthTransport,
    vault: any TokenVault,
    legacy: (any LegacySessionStore)? = nil,
    signOutMarker: SignOutMarker? = nil,
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.transport = transport
    self.vault = vault
    self.legacy = legacy
    self.signOutMarker = signOutMarker
    self.now = now
    let markerState = signOutMarker?.state ?? .absent
    self.waitingForStorage = markerState == .inaccessible
    self.tokens = markerState == .absent ? vault.read() : nil
  }

  var isSignedIn: Bool { tokens != nil }

  func signIn(_ credential: SignInCredential) async throws {
    let response = try await transport.signIn(credential.request)
    guard let fresh = response.tokens else { throw AuthSessionError.signInRefused }
    guard signOutMarker?.state != .inaccessible, legacy?.forget() != false, vault.write(fresh) else {
      throw AuthSessionError.sessionStorageUnavailable
    }
    try signOutMarker?.clear()
    waitingForStorage = false
    setTokens(fresh)
  }

  func startOAuth(provider: String, redirectTo: URL) async throws -> OAuthStart {
    let response = try await transport.signIn(
      SignInRequest(provider: provider, params: ["redirectTo": redirectTo.absoluteString]))
    guard
      let redirect = response.redirect.flatMap(URL.init(string:)),
      let verifier = response.verifier
    else { throw AuthSessionError.missingRedirect }
    return OAuthStart(url: redirect, verifier: verifier)
  }

  func restore() {
    switch signOutMarker?.state ?? .absent {
    case .pending:
      waitingForStorage = false
      clearStoredSession()
      return
    case .inaccessible:
      return
    case .absent:
      if waitingForStorage {
        waitingForStorage = false
        tokens = vault.read()
      }
    }
    guard let legacy, let refreshToken = legacy.refreshToken() else { return }
    let handoff = AuthTokens(token: "", refreshToken: refreshToken)
    guard vault.write(handoff), vault.read() == handoff else { return }
    setTokens(handoff)
    legacy.forget()
  }

  func validToken(minimumLifetime: TimeInterval = 300, reconnecting: Bool = false) async throws
    -> String?
  {
    guard let current = tokens else { return nil }
    let refresh = reconnecting && wasRefused(current.token)
    let token = try await token(current, minimumLifetime: minimumLifetime, refresh: refresh)
    if reconnecting { lastReconnect = token.map { ($0, now()) } }
    return token
  }

  private func wasRefused(_ token: String) -> Bool {
    guard let last = lastReconnect, last.token == token, now().timeIntervalSince(last.at) < 20 else {
      return false
    }
    guard let mintedAt else { return true }
    let age = now().timeIntervalSince(mintedAt)
    return age > 60 || age < 0
  }

  private func token(_ current: AuthTokens, minimumLifetime: TimeInterval, refresh: Bool) async throws
    -> String?
  {
    if !refresh, let freshUntil, freshUntil.timeIntervalSince(now()) > minimumLifetime {
      return current.token
    }
    do {
      return try await refreshed()?.token
    } catch {
      guard let stale = tokens?.token, !stale.isEmpty else { throw error }
      return stale
    }
  }

  func signOut(onLocalSignOut: @Sendable () async -> Void = {}) async throws {
    try signOutMarker?.record()
    let token = tokens?.token
    refresh?.cancel()
    refresh = nil
    setTokens(nil)
    clearStoredSession()
    await onLocalSignOut()
    guard let token, !token.isEmpty else { return }
    try? await transport.signOut(token: token)
  }

  private func clearStoredSession() {
    let clearedNative = vault.write(nil)
    let clearedLegacy = legacy?.forget() ?? true
    if clearedNative, clearedLegacy {
      try? signOutMarker?.clear()
    }
  }

  private func refreshed() async throws -> AuthTokens? {
    if let refresh { return try await refresh.value }
    guard let refreshToken = tokens?.refreshToken else { return nil }
    let task = Task { () async throws -> AuthTokens? in
      let fresh = try await transport.signIn(SignInRequest(refreshToken: refreshToken)).tokens
      guard tokens?.refreshToken == refreshToken else { return tokens }
      vault.write(fresh)
      setTokens(fresh)
      return fresh
    }
    refresh = task
    defer { if refresh == task { refresh = nil } }
    return try await task.value
  }

  private func setTokens(_ fresh: AuthTokens?) {
    tokens = fresh
    mintedAt = fresh.map { _ in now() }
    freshUntil = fresh?.lifetime.map { now().addingTimeInterval($0) }
  }
}

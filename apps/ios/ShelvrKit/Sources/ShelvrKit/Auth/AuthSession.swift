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
  private let signOutMarker: SignOutMarker?
  private let now: @Sendable () -> Date
  private var held: (tokens: AuthTokens, receivedAt: Date?)?
  private var refresh: Task<AuthTokens?, Error>?
  private var lastReconnect: (token: String, at: Date)?

  init(
    transport: any AuthTransport,
    vault: any TokenVault,
    signOutMarker: SignOutMarker? = nil,
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.transport = transport
    self.vault = vault
    self.signOutMarker = signOutMarker
    self.now = now
  }

  private var tokens: AuthTokens? { held?.tokens }
  var isSignedIn: Bool { held != nil }

  func signIn(_ credential: SignInCredential) async throws {
    let response = try await transport.signIn(credential.request)
    guard let fresh = response.tokens else { throw AuthSessionError.signInRefused }
    guard signOutMarker?.state != .inaccessible, vault.write(fresh) else {
      throw AuthSessionError.sessionStorageUnavailable
    }
    try signOutMarker?.clear()
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
      forgetSession()
    case .inaccessible:
      break
    case .absent:
      if held == nil { held = vault.read().map { ($0, nil) } }
    }
  }

  func validToken(reconnecting: Bool = false) async throws -> String? {
    guard let current = held else { return nil }
    let refresh = reconnecting && wasRefused(current.tokens.token)
    let token = try await token(current, refresh: refresh)
    if reconnecting { lastReconnect = token.map { ($0, now()) } }
    return token
  }

  private func wasRefused(_ token: String) -> Bool {
    guard let last = lastReconnect, last.token == token, now().timeIntervalSince(last.at) < 20 else {
      return false
    }
    guard let receivedAt = held?.receivedAt else { return true }
    let age = now().timeIntervalSince(receivedAt)
    return age > 60 || age < 0
  }

  private func token(_ current: (tokens: AuthTokens, receivedAt: Date?), refresh: Bool) async throws
    -> String?
  {
    if !refresh, let receivedAt = current.receivedAt, let lifetime = current.tokens.lifetime,
      receivedAt.addingTimeInterval(lifetime).timeIntervalSince(now()) > 300
    {
      return current.tokens.token
    }
    do {
      return try await refreshed()?.token
    } catch {
      guard let stale = tokens?.token else { throw error }
      return stale
    }
  }

  func signOut(onLocalSignOut: @Sendable () async -> Void = {}) async throws {
    try signOutMarker?.record()
    let token = tokens?.token
    refresh?.cancel()
    refresh = nil
    forgetSession()
    await onLocalSignOut()
    guard let token else { return }
    try? await transport.signOut(token: token)
  }

  func forgetDeletedAccount() {
    try? signOutMarker?.record()
    refresh?.cancel()
    refresh = nil
    forgetSession()
  }

  private func forgetSession() {
    setTokens(nil)
    if vault.write(nil) {
      try? signOutMarker?.clear()
    }
  }

  private func refreshed() async throws -> AuthTokens? {
    if let refresh { return try await refresh.value }
    guard let refreshToken = tokens?.refreshToken else { return nil }
    let task = Task { () async throws -> AuthTokens? in
      let fresh = try await transport.signIn(SignInRequest(refreshToken: refreshToken)).tokens
      guard tokens?.refreshToken == refreshToken else { return tokens }
      guard let fresh else {
        try? signOutMarker?.record()
        forgetSession()
        return nil
      }
      vault.write(fresh)
      setTokens(fresh)
      return fresh
    }
    refresh = task
    defer { if refresh == task { refresh = nil } }
    return try await task.value
  }

  private func setTokens(_ fresh: AuthTokens?) {
    held = fresh.map { ($0, now()) }
  }
}

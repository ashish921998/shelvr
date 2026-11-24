import Foundation

public protocol LegacySessionStore: Sendable {
  func refreshToken() -> String?
  @discardableResult func forget() -> Bool
}

public struct LegacyExpoSession: LegacySessionStore {
  enum Entry: String, CaseIterable {
    case refreshToken = "__convexAuthRefreshToken"
    case jwt = "__convexAuthJWT"
    case oauthVerifier = "__convexAuthOAuthVerifier"
    case serverStateFetchTime = "__convexAuthServerStateFetchTime"
  }

  private let store: ExpoSecureStore
  private let deploymentNamespace: String

  public init(convexURL: URL) {
    self.init(convexURL: convexURL, store: ExpoSecureStore(deployment: convexURL))
  }

  init(convexURL: URL, store: ExpoSecureStore) {
    deploymentNamespace = convexURL.absoluteString.replacing(/[^A-Za-z0-9]/, with: "")
    self.store = store
  }

  func account(for entry: Entry) -> String {
    "\(store.namespace)_\(entry.rawValue)_\(deploymentNamespace)"
  }

  public func refreshToken() -> String? {
    store.string(account(for: .refreshToken))
  }

  @discardableResult
  public func forget() -> Bool {
    Entry.allCases.map { store.delete(account(for: $0)) }.allSatisfy { $0 }
  }
}

import Foundation
import Security

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

  static let services = ["app:no-auth", "app"]
  private let deploymentNamespace: String
  private let storageNamespace: String

  public init(convexURL: URL) {
    let url = convexURL.absoluteString
    deploymentNamespace = url.replacing(/[^A-Za-z0-9]/, with: "")
    storageNamespace = url.replacing(/[^A-Za-z0-9._-]/, with: "_")
  }

  func account(for entry: Entry) -> String {
    "\(storageNamespace)_\(entry.rawValue)_\(deploymentNamespace)"
  }

  public func refreshToken() -> String? {
    for service in Self.services {
      guard
        let data = Keychain.read(query(service: service, entry: .refreshToken)),
        let token = String(data: data, encoding: .utf8), !token.isEmpty
      else { continue }
      return token
    }
    return nil
  }

  @discardableResult
  public func forget() -> Bool {
    let cleared = Self.services.flatMap { service in
      Entry.allCases.map { Keychain.delete(query(service: service, entry: $0)) }
    }
    return cleared.allSatisfy { $0 }
  }

  private func query(service: String, entry: Entry) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: Data(account(for: entry).utf8),
    ]
  }
}

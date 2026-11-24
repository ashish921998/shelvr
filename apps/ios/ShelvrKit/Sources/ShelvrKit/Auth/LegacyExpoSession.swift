import Foundation
import Security

public protocol LegacySessionStore: Sendable {
  func refreshToken() -> String?
  @discardableResult func forget() -> Bool
}

public struct LegacyExpoSession: LegacySessionStore {
  static let services = ["app:no-auth", "app"]
  let accountSuffix: String

  public init(convexURL: URL) {
    let namespace = convexURL.absoluteString.replacing(/[^A-Za-z0-9]/, with: "")
    accountSuffix = "__convexAuthRefreshToken_\(namespace)"
  }

  func matches(account: String) -> Bool {
    account.hasSuffix(accountSuffix)
  }

  public func refreshToken() -> String? {
    for item in Self.services.flatMap({ items(service: $0) ?? [] }) {
      guard
        let data = Keychain.read(item),
        let token = String(data: data, encoding: .utf8), !token.isEmpty
      else { continue }
      return token
    }
    return nil
  }

  @discardableResult
  public func forget() -> Bool {
    let cleared = Self.services.map { service in
      guard let items = items(service: service) else { return false }
      return items.map { Keychain.delete($0) }.allSatisfy { $0 }
    }
    return cleared.allSatisfy { $0 }
  }

  private func items(service: String) -> [[String: Any]]? {
    Keychain.accounts(service: service)?
      .filter { String(data: $0, encoding: .utf8).map(matches(account:)) ?? false }
      .map { account in
        [
          kSecClass as String: kSecClassGenericPassword,
          kSecAttrService as String: service,
          kSecAttrAccount as String: account,
        ]
      }
  }
}

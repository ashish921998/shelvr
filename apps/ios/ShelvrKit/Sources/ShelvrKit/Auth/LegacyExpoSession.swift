import Foundation
import Security

public protocol LegacySessionStore: Sendable {
  func refreshToken() -> String?
  func forget()
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
    for item in items() {
      guard
        let data = Keychain.read(item),
        let token = String(data: data, encoding: .utf8), !token.isEmpty
      else { continue }
      return token
    }
    return nil
  }

  public func forget() {
    for item in items() { Keychain.delete(item) }
  }

  private func items() -> [[String: Any]] {
    Self.services.flatMap { service in
      Keychain.accounts(service: service)
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
}

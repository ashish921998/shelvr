import Foundation
import Security

public protocol TokenVault: Sendable {
  func read() -> AuthTokens?
  @discardableResult func write(_ tokens: AuthTokens?) -> Bool
}

public struct KeychainTokenVault: TokenVault {
  let service: String
  let account: String

  public init(service: String = "app.shelvr.session", account: String = "convex-auth") {
    self.service = service
    self.account = account
  }

  public func read() -> AuthTokens? {
    Keychain.read(query).flatMap { try? JSONDecoder().decode(AuthTokens.self, from: $0) }
  }

  @discardableResult
  public func write(_ tokens: AuthTokens?) -> Bool {
    guard let tokens else { return Keychain.delete(query) }
    guard let data = try? JSONEncoder().encode(tokens) else { return false }
    return Keychain.write(data, to: query)
  }

  private var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

enum Keychain {
  static func read(_ query: [String: Any]) -> Data? {
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(lookup as CFDictionary, &result) == errSecSuccess else { return nil }
    return result as? Data
  }

  static func write(_ data: Data, to query: [String: Any]) -> Bool {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      return SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil) == errSecSuccess
    }
    return status == errSecSuccess
  }

  static func delete(_ query: [String: Any]) -> Bool {
    let status = SecItemDelete(query as CFDictionary)
    return status == errSecSuccess || status == errSecItemNotFound
  }

  static func accounts(service: String) -> [Data]? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecReturnAttributes as String: true,
      kSecMatchLimit as String: kSecMatchLimitAll,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess, let items = result as? [[String: Any]] else { return nil }
    return items.compactMap { item in
      let account = item[kSecAttrAccount as String]
      return account as? Data ?? (account as? String).map { Data($0.utf8) }
    }
  }
}

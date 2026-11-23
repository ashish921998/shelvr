import Foundation
import Security

public protocol TokenVault: Sendable {
  func read() -> AuthTokens?
  func write(_ tokens: AuthTokens?)
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

  public func write(_ tokens: AuthTokens?) {
    guard let tokens, let data = try? JSONEncoder().encode(tokens) else {
      Keychain.delete(query)
      return
    }
    Keychain.write(data, to: query)
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

  static func write(_ data: Data, to query: [String: Any]) {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
      SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
    }
  }

  static func delete(_ query: [String: Any]) {
    SecItemDelete(query as CFDictionary)
  }

  static func accounts(service: String) -> [Data] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecReturnAttributes as String: true,
      kSecMatchLimit as String: kSecMatchLimitAll,
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let items = result as? [[String: Any]]
    else { return [] }
    return items.compactMap { item in
      let account = item[kSecAttrAccount as String]
      return account as? Data ?? (account as? String).map { Data($0.utf8) }
    }
  }
}

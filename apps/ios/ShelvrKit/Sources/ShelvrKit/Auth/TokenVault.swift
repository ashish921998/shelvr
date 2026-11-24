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

  var isAbsent: Bool { SecItemCopyMatching(query as CFDictionary, nil) == errSecItemNotFound }

  func checkedTokens() throws -> AuthTokens? {
    try Keychain.checkedData(query).map { try JSONDecoder().decode(AuthTokens.self, from: $0) }
  }

  public func read() -> AuthTokens? { try? checkedTokens() }

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
  static func read(_ query: [String: Any]) -> Data? { try? checkedData(query) }

  static func checkedData(_ query: [String: Any]) throws -> Data? {
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    let status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    guard let bytes = result as? Data else { throw CocoaError(.coderReadCorrupt) }
    return bytes
  }

  static func write(_ data: Data, to query: [String: Any], accessibility: CFString = kSecAttrAccessibleAfterFirstUnlock) -> Bool {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: accessibility,
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
}

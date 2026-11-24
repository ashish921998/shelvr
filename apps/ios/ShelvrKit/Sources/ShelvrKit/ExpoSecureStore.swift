import Foundation
import Security

struct ExpoSecureStore: Sendable {
  let namespace: String
  let read: @Sendable ([String: Any]) -> Data?
  private static let services = ["app:no-auth", "app"]

  init(deployment: URL, read: @escaping @Sendable ([String: Any]) -> Data? = Keychain.read) {
    namespace = deployment.absoluteString.replacing(/[^A-Za-z0-9._-]/, with: "_")
    self.read = read
  }

  static func query(service: String, key: String) -> [String: Any] {
    let account = Data(key.utf8)
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: account, kSecAttrGeneric as String: account]
  }

  func string(_ key: String) -> String? {
    data(key).flatMap { String(data: $0, encoding: .utf8) }
  }

  func data(_ key: String) -> Data? {
    for service in Self.services {
      if let data = read(Self.query(service: service, key: key)) {
        return data.isEmpty ? nil : data
      }
    }
    return nil
  }

  func delete(_ key: String) -> Bool {
    Self.services.map { Keychain.delete(Self.query(service: $0, key: key)) }.allSatisfy { $0 }
  }
}

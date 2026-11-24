import Foundation
import Security

public struct PushInstallation: Sendable {
  public let id: String
  public let secret: String
  private static let expoKey = "EXDeviceInstallationUUIDKey"

  public init(bundleID: String) throws {
    id = try Self.stored(Self.expoKey, service: bundleID,
      fallback: UserDefaults.standard.string(forKey: Self.expoKey)).lowercased()
    secret = try Self.stored("notification-install-secret", service: "app:no-auth", fallback: nil)
  }

  private static func stored(_ name: String, service: String, fallback: String?) throws -> String {
    let key = Data(name.utf8)
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: key, kSecAttrGeneric as String: key]
    func read() throws -> String? {
      var result: CFTypeRef?
      let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true]) { $1 } as CFDictionary, &result)
      if status == errSecItemNotFound { return nil }
      guard status == errSecSuccess, let data = result as? Data,
        let stored = String(data: data, encoding: .utf8), !stored.isEmpty
      else { throw CocoaError(.fileReadNoPermission) }
      return stored
    }
    if let stored = try read() { return stored }
    let value = fallback ?? UUID().uuidString
    let record = query.merging([kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { $1 }
    let status = SecItemAdd(record as CFDictionary, nil)
    if status == errSecDuplicateItem, let stored = try read() { return stored }
    guard status == errSecSuccess else { throw CocoaError(.fileWriteNoPermission) }
    return value
  }
}

public struct ExpoPushRequest: Encodable, Sendable {
  public let type = "apns"
  public let projectId = "c6c97aa7-6676-47a1-8ffc-9a1339c2bc19"
  public let appId, deviceToken, deviceId: String
  public let development: Bool

  public init(bundleID: String, apns: Data, installation: String, development: Bool) {
    appId = bundleID
    deviceToken = apns.map { String(format: "%02x", $0) }.joined()
    deviceId = installation.lowercased()
    self.development = development
  }

  public func exchange() async throws -> String {
    struct Response: Decodable {
      struct Token: Decodable { let expoPushToken: String }
      let data: Token
    }
    var request = URLRequest(url: URL(string: "https://exp.host/--/api/v2/push/getExpoPushToken")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(self)
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    let token = try JSONDecoder().decode(Response.self, from: data).data.expoPushToken
    guard !token.isEmpty else { throw URLError(.cannotParseResponse) }
    return token
  }
}


struct PushRegistrationRecord: Codable, Equatable {
  let token: String
  let registrationId: String
}

struct PushTokenStore {
  let serviceURL: URL

  private var query: [String: Any] {
    let normalized = serviceURL.absoluteString.replacing(/[^A-Za-z0-9._-]/, with: "_")
    let key = Data(("swift-notification-registrations-" + normalized).utf8)
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app:no-auth",
      kSecAttrAccount as String: key, kSecAttrGeneric as String: key]
  }

  func read() throws -> [PushRegistrationRecord] {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true]) { $1 } as CFDictionary, &result)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess, let data = result as? Data else { throw CocoaError(.fileReadNoPermission) }
    return try JSONDecoder().decode([PushRegistrationRecord].self, from: data)
  }

  func write(_ tokens: [PushRegistrationRecord]) throws {
    guard Keychain.write(try JSONEncoder().encode(tokens), to: query) else { throw CocoaError(.fileWriteNoPermission) }
  }
}

struct PushTransport {
  let deployment: URL

  func call(_ path: String, args: [String: String], bearer: String? = nil) async throws {
    struct Request: Encodable { let path: String; let args: [String: String]; let format = "json" }
    struct Response: Decodable { let status: String }
    var request = URLRequest(url: deployment.appending(path: "api/mutation"), timeoutInterval: 12)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
    request.httpBody = try JSONEncoder().encode(Request(path: path, args: args))
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
      try JSONDecoder().decode(Response.self, from: data).status == "success" else {
      throw URLError(.badServerResponse)
    }
  }
}

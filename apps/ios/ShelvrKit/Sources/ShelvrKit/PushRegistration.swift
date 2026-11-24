import CryptoKit
import Foundation
import Security

public struct PushInstallation: Sendable {
  public let id: String
  public let secret: String
  private static let expoKey = "EXDeviceInstallationUUIDKey"

  public init(bundleID: String) throws {
    id = try Self.stored(Self.expoKey, service: bundleID,
      fallback: UserDefaults.standard.string(forKey: Self.expoKey)).lowercased()
    secret = try Self.stored("notification-install-secret", service: "app:no-auth", fallback: nil, legacyService: "app")
  }

  private static func stored(_ name: String, service: String, fallback: String?, legacyService: String? = nil) throws -> String {
    let key = Data(name.utf8)
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: key, kSecAttrGeneric as String: key]
    func read(_ serviceOverride: String? = nil) throws -> String? {
      var result: CFTypeRef?
      var lookup = query
      lookup[kSecAttrService as String] = serviceOverride ?? service
      lookup[kSecReturnData as String] = true
      let status = SecItemCopyMatching(lookup as CFDictionary, &result)
      if status == errSecItemNotFound { return nil }
      guard status == errSecSuccess, let data = result as? Data,
        let stored = String(data: data, encoding: .utf8), !stored.isEmpty
      else { throw CocoaError(.fileReadNoPermission) }
      return stored
    }
    if let stored = try read() { return stored }
    let prior = try legacyService.flatMap { try read($0) }
    let value = prior ?? fallback ?? UUID().uuidString
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

  public func exchange(session: URLSession = .shared) async throws -> String {
    struct Response: Decodable {
      struct Token: Decodable { let expoPushToken: String }
      let data: Token
    }
    var request = URLRequest(url: URL(string: "https://exp.host/--/api/v2/push/getExpoPushToken")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(self)
    let (data, response) = try await session.data(for: request)
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
  var keychainService = "app:no-auth"

  static func registrationID(bearer: String, installSecret: String) throws -> UUID {
    guard let subject = JWT.claims(of: bearer)?.sub, !subject.isEmpty else { throw AuthSessionError.notSignedIn }
    let mac = HMAC<SHA256>.authenticationCode(for: Data(subject.utf8), using: SymmetricKey(data: Data(installSecret.utf8)))
    var bytes = Array(mac.prefix(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x80
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    return bytes.withUnsafeBytes { UUID(uuid: $0.loadUnaligned(as: uuid_t.self)) }
  }

  private func query(_ prefix: String, service: String? = nil) -> [String: Any] {
    let normalized = serviceURL.absoluteString.replacing(/[^A-Za-z0-9._-]/, with: "_")
    let key = Data((prefix + normalized).utf8)
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service ?? keychainService,
      kSecAttrAccount as String: key, kSecAttrGeneric as String: key]
  }

  private func values<T: Decodable>(_ type: T.Type, _ prefix: String, service: String? = nil) throws -> [T] {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query(prefix, service: service).merging([kSecReturnData as String: true]) { $1 } as CFDictionary, &result)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess, let data = result as? Data else { throw CocoaError(.fileReadNoPermission) }
    return try JSONDecoder().decode([T].self, from: data)
  }

  private func write<T: Encodable>(_ entries: [T], _ prefix: String, service: String? = nil) throws {
    let target = query(prefix, service: service)
    let ok = entries.isEmpty ? Keychain.delete(target) : try Keychain.write(JSONEncoder().encode(entries), to: target)
    if !ok { throw CocoaError(.fileWriteNoPermission) }
  }

  func read() throws -> [PushRegistrationRecord] { try values(PushRegistrationRecord.self, "swift-notification-registrations-") }

  func legacyTokens(service: String? = nil) throws -> [String] { try values(String.self, "notification-tokens-", service: service) }

  func writeLegacy(_ tokens: [String], service: String? = nil) throws { try write(tokens, "notification-tokens-", service: service) }

  @MainActor func adoptLegacy(for generation: UUID, suspend: () -> Void, register: (PushRegistrationRecord) async throws -> Void) async throws {
    var services = [keychainService]
    if keychainService.hasSuffix(":no-auth") { services.append(String(keychainService.dropLast(":no-auth".count))) }
    for service in services {
      var pending = try legacyTokens(service: service)
      guard !pending.isEmpty else { continue }
      suspend()
      var records = try read()
      for token in pending {
        let record = PushRegistrationRecord(token: token, registrationId: generation.uuidString)
        if !records.contains(record) {
          records.append(record)
          try write(records)
        }
        try await register(record)
        pending.removeAll { $0 == token }
        try writeLegacy(pending, service: service)
      }
    }
  }

  @MainActor func retireStale(keeping generation: UUID?, suspend: () -> Void,
    unregister: (PushRegistrationRecord) async throws -> Void) async throws {
    var records: [PushRegistrationRecord]
    do { records = try read() } catch { suspend(); throw error }
    let stale = records.filter { $0.registrationId != generation?.uuidString }
    guard !stale.isEmpty else { return }
    suspend()
    for record in stale {
      try await unregister(record)
      records.removeAll { $0 == record }
      try write(records)
    }
  }

  func write(_ tokens: [PushRegistrationRecord]) throws { try write(tokens, "swift-notification-registrations-") }
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

import CryptoKit
import Foundation
import Security

public struct PushInstallation: Sendable {
  public let id: String
  public let secret: String
  public let hasExpoDeviceIdentity: Bool

  public init(bundleID: String) throws {
    try self.init(bundleID: bundleID, expoSecretService: "app:no-auth", oldSecretService: "app")
  }

  init(bundleID: String, expoSecretService: String, oldSecretService: String) throws {
    if let original = try Self.read("EXDeviceInstallationUUIDKey", service: bundleID) {
      id = original.lowercased()
      secret = try Self.stored("notification-install-secret", service: expoSecretService, legacyService: oldSecretService)
      hasExpoDeviceIdentity = true
    } else {
      id = try Self.stored("swift-notification-installation-id", service: bundleID).lowercased()
      secret = try Self.stored("swift-notification-installation-secret", service: bundleID + ".push-secret")
      hasExpoDeviceIdentity = false
    }
  }

  private static func key(_ name: String, service: String) -> [String: Any] {
    let encoded = Data(name.utf8)
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: encoded, kSecAttrGeneric as String: encoded]
  }

  private static func read(_ name: String, service: String) throws -> String? {
    var result: CFTypeRef?
    let lookup = key(name, service: service).merging([kSecReturnData as String: true]) { $1 }
    let status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data,
      let value = String(data: data, encoding: .utf8), !value.isEmpty else { throw CocoaError(.fileReadNoPermission) }
    return value
  }

  private static func stored(_ name: String, service: String, legacyService: String? = nil) throws -> String {
    if let existing = try read(name, service: service) { return existing }
    let prior = try legacyService.flatMap { try read(name, service: $0) }
    let value = prior ?? UUID().uuidString
    let item = key(name, service: service).merging([kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { $1 }
    let status = SecItemAdd(item as CFDictionary, nil)
    if status == errSecDuplicateItem, let existing = try read(name, service: service) { return existing }
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
  var apnsDigest: String? = nil
}

public struct PushDeliveryState {
  public private(set) var token: Data?
  private var generation: UUID?
  private var verified = Set<String>()
  private var suspended = false

  public init() {}

  public var isProbing: Bool { generation != nil && suspended }
  public var permitsPresentation: Bool { generation != nil && !suspended && !verified.isEmpty }

  static func digest(_ data: Data) -> String { Data(SHA256.hash(data: data)).base64EncodedString() }

  public mutating func prepare(generation: UUID, verified: Set<String>) -> Bool {
    let changed = self.generation != generation
    if changed { token = nil }
    self.generation = generation
    self.verified = verified
    let unverifiedToken = token.map { !verified.contains(Self.digest($0)) } ?? false
    if (changed && verified.isEmpty) || (unverifiedToken && !suspended) { suspended = true; return true }
    return false
  }

  public mutating func receive(_ native: Data) -> Bool {
    guard generation != nil else { return true }
    token = native
    suspended = !verified.contains(Self.digest(native))
    return suspended
  }

  public mutating func confirm(_ native: Data, generation: UUID) -> Bool {
    guard self.generation == generation, token == native else { return false }
    verified = [Self.digest(native)]
    let resume = suspended
    suspended = false
    return resume
  }
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
    let ok = entries.isEmpty ? Keychain.delete(target) : try Keychain.write(JSONEncoder().encode(entries), to: target, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    if !ok { throw CocoaError(.fileWriteNoPermission) }
  }

  func read() throws -> [PushRegistrationRecord] { try values(PushRegistrationRecord.self, "swift-notification-registrations-") }

  func legacyTokens(service: String? = nil) throws -> [String] { try values(String.self, "notification-tokens-", service: service) }

  func writeLegacy(_ tokens: [String], service: String? = nil) throws { try write(tokens, "notification-tokens-", service: service) }

  @MainActor func registerFresh(_ fresh: String, native: Data, for generation: UUID,
    register: (PushRegistrationRecord) async throws -> Void,
    unregister: (PushRegistrationRecord) async throws -> Void) async throws {
    let record = PushRegistrationRecord(token: fresh, registrationId: generation.uuidString)
    let digest = PushDeliveryState.digest(native)
    let records = try read()
    let previous = records.first { $0.token == fresh && $0.registrationId == record.registrationId }
    let other = records.filter { $0.token != fresh || $0.registrationId != record.registrationId }
    try write(other + [record])
    do {
      try await register(record)
    } catch PushRegistrationError.ownedByAnotherAccount {
      throw PushRegistrationError.ownedByAnotherAccount
    } catch {
      if let previous, previous.apnsDigest == digest { try write(other + [previous]) }
      throw error
    }
    for old in other { try await unregister(old) }
    try write([PushRegistrationRecord(token: fresh, registrationId: record.registrationId, apnsDigest: digest)])
    var services = [keychainService]
    if keychainService.hasSuffix(":no-auth") { services.append(String(keychainService.dropLast(":no-auth".count))) }
    for service in services {
      if let legacy = try? legacyTokens(service: service), legacy.contains(fresh) {
        try? writeLegacy(legacy.filter { $0 != fresh }, service: service)
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

public enum PushRetry {
  @MainActor public static func run<T>(while current: () -> Bool,
    sleep: @MainActor (Int) async throws -> Void = { try await Task.sleep(for: .seconds($0)) },
    attempt: @MainActor () async throws -> T) async throws -> T {
    var delay = 2
    while !Task.isCancelled, current() {
      do { return try await attempt() }
      catch is CancellationError { throw CancellationError() }
      catch PushRegistrationError.ownedByAnotherAccount { throw PushRegistrationError.ownedByAnotherAccount }
      catch {
        try Task.checkCancellation()
        guard current() else { throw CancellationError() }
        try await sleep(delay)
        delay = min(60, delay * 2)
      }
    }
    throw CancellationError()
  }
}

public enum PushRegistrationError: Error, Equatable { case ownedByAnotherAccount }

struct PushTransport {
  let deployment: URL
  var session: URLSession = .shared

  func call(_ path: String, args: [String: String], bearer: String? = nil) async throws {
    struct Request: Encodable { let path: String; let args: [String: String]; let format = "json" }
    struct Response: Decodable {
      struct Rejection: Decodable { let code: String }
      let status: String
      let errorData: Rejection?
    }
    var request = URLRequest(url: deployment.appending(path: "api/mutation"), timeoutInterval: 12)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
    request.httpBody = try JSONEncoder().encode(Request(path: path, args: args))
    let (data, response) = try await session.data(for: request)
    let reply = try JSONDecoder().decode(Response.self, from: data)
    if reply.status == "error", reply.errorData?.code == "notification_token_owned_by_another_account" {
      throw PushRegistrationError.ownedByAnotherAccount
    }
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), reply.status == "success" else {
      throw URLError(.badServerResponse)
    }
  }
}

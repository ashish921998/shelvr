import Foundation
import Security

public struct ExpoDeviceState {
  public struct CaptureCredentials: Decodable {
    public let siteUrl: String
    public let token: String
  }

  let bundleID: String
  let deployment: URL
  let defaults: UserDefaults
  let group: UserDefaults?
  let read: ([String: Any]) -> Data?

  init(bundleID: String, deployment: URL, defaults: UserDefaults = .standard,
       group: UserDefaults?, read: @escaping ([String: Any]) -> Data? = Keychain.read) {
    self.bundleID = bundleID
    self.deployment = deployment
    self.defaults = defaults
    self.group = group
    self.read = read
  }

  public var onboarded: Bool { secureString("shelvr.onboarded") == "true" }
  public var installSecret: String? { secureString("notification-install-secret") }
  public var hasPendingShare: Bool { secureString("shelvr.pending.share") == "1" }
  public var discardedShare: String? { secureString("shelvr.discarded.share") }
  public var pendingSharePayloads: Data? { group?.data(forKey: "expo-sharing") }
  public var pendingInvocations: Data? { defaults.data(forKey: "dev.expo.appintents.invocations.pending") }

  public var installationID: String? {
    notificationValue("EXDeviceInstallationUUIDKey") ?? defaults.string(forKey: "EXDeviceInstallationUUIDKey")
  }

  public var registrationInfo: String? { notificationValue("EXNotificationRegistrationInfoKey") }

  public func notificationTokens() throws -> [String] {
    let namespace = deployment.absoluteString.replacing(/[^A-Za-z0-9._-]/, with: "_")
    guard let stored = secureString("notification-tokens-\(namespace)") else { return [] }
    return try JSONDecoder().decode([String].self, from: Data(stored.utf8))
  }

  public func captureCredentials() throws -> CaptureCredentials? {
    guard let data = read([kSecClass as String: kSecClassGenericPassword,
                           kSecAttrService as String: "shelvr.app-intents.capture",
                           kSecAttrAccount as String: "credentials"]) else { return nil }
    return try JSONDecoder().decode(CaptureCredentials.self, from: data)
  }

  private func notificationValue(_ key: String) -> String? {
    string(service: bundleID, key: key)
  }

  private func secureString(_ key: String) -> String? {
    for service in LegacyExpoSession.services {
      if let value = string(service: service, key: key) { return value.isEmpty ? nil : value }
    }
    return nil
  }

  private func string(service: String, key: String) -> String? {
    let account = Data(key.utf8)
    return read([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                 kSecAttrAccount as String: account, kSecAttrGeneric as String: account])
      .flatMap { String(data: $0, encoding: .utf8) }
  }
}

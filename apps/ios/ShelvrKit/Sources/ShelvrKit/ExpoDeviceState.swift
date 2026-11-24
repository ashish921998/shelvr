import Foundation
import Security

public struct ExpoDeviceState {
  public struct CaptureCredentials: Decodable {
    public let siteUrl: String
    public let token: String
  }

  private let environment: AppEnvironment
  private let defaults: UserDefaults
  private let group: UserDefaults?
  private let store: ExpoSecureStore

  public init(environment: AppEnvironment) {
    self.init(environment: environment, defaults: .standard, group: UserDefaults(suiteName: environment.appGroup))
  }

  init(environment: AppEnvironment, defaults: UserDefaults, group: UserDefaults?,
       read: @escaping @Sendable ([String: Any]) -> Data? = Keychain.read) {
    self.environment = environment
    self.defaults = defaults
    self.group = group
    store = ExpoSecureStore(deployment: environment.convexURL, read: read)
  }

  public var onboarded: Bool { store.string("shelvr.onboarded") == "true" }
  public var installSecret: String? { store.string("notification-install-secret") }
  public var hasPendingShare: Bool { store.string("shelvr.pending.share") == "1" }
  public var discardedShare: String? { store.string("shelvr.discarded.share") }
  public func pendingSharePayloads() throws -> [SharePayload] {
    try decode([SharePayload].self, group?.data(forKey: "expo-sharing")) ?? []
  }

  public func pendingInvocations() throws -> [Invocation] {
    try decode([Skippable<Invocation>].self, defaults.data(forKey: "dev.expo.appintents.invocations.pending"))?
      .compactMap(\.value) ?? []
  }

  public var installationID: String? {
    notificationData("EXDeviceInstallationUUIDKey").flatMap { String(data: $0, encoding: .utf8) } ?? defaults.string(forKey: "EXDeviceInstallationUUIDKey")
  }

  public func registrationInfo() throws -> RegistrationInfo? {
    try decode(RegistrationInfo.self, notificationData("EXNotificationRegistrationInfoKey"))
  }

  public func notificationTokens() throws -> [String] {
    try decode([String].self, store.data("notification-tokens-\(store.namespace)")) ?? []
  }

  public func captureCredentials() throws -> CaptureCredentials? {
    try decode(CaptureCredentials.self, store.read([
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "shelvr.app-intents.capture",
      kSecAttrAccount as String: "credentials",
    ]))
  }

  private func notificationData(_ key: String) -> Data? {
    store.read(ExpoSecureStore.query(service: environment.bundleID, key: key))
  }

  private func decode<T: Decodable>(_ type: T.Type, _ data: Data?) throws -> T? {
    try data.map { try JSONDecoder().decode(type, from: $0) }
  }
}

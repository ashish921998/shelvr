import Foundation
import Security
import Testing
@testable import ShelvrKit

@Test func usesTheExistingExpoInstallationAndAPNsRequestShape() throws {
  let request = ExpoPushRequest(bundleID: "app.shelvr.save.preview", apns: Data([0, 10, 255]),
    installation: "ABC", development: true)
  let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
  #expect(object["deviceToken"] as? String == "000aff")
  #expect(object["type"] as? String == "apns")
  #expect(object["deviceId"] as? String == "abc")
  #expect(object["development"] as? Bool == true)
  #expect(object["projectId"] as? String == "c6c97aa7-6676-47a1-8ffc-9a1339c2bc19")
}

@MainActor @Test func retirementOnlyRemovesTheOldGenerationWhenTwoAccountsReuseAToken() async throws {
  let store = PushTokenStore(serviceURL: URL(string: "https://example.convex.cloud")!, keychainService: "test.shelvr.push.\(UUID().uuidString)")
  defer { try? store.write([]) }
  let current = UUID()
  let old = PushRegistrationRecord(token: "reused", registrationId: UUID().uuidString)
  let replacement = PushRegistrationRecord(token: "reused", registrationId: current.uuidString)
  try store.write([old, replacement])
  var order: [String] = []
  try await store.retireStale(keeping: current, suspend: { order.append("suspend") }) {
    #expect($0 == old)
    order.append("unregister")
  }
  #expect(order == ["suspend", "unregister"])
  #expect(try store.read() == [replacement])
  try await store.retireStale(keeping: current, suspend: { Issue.record("Current registration must stay enrolled") }) { _ in
    Issue.record("Unexpected revocation of the new account")
  }
}

@MainActor @Test func failedOfflineCleanupIsRetriedBeforeEnrollingTheNextAccount() async throws {
  let store = PushTokenStore(serviceURL: URL(string: "https://example.convex.cloud")!, keychainService: "test.shelvr.push.\(UUID().uuidString)")
  defer { try? store.write([]) }
  let one = PushRegistrationRecord(token: "one", registrationId: UUID().uuidString)
  let two = PushRegistrationRecord(token: "two", registrationId: UUID().uuidString)
  try store.write([one, two])
  await #expect(throws: URLError.self) {
    try await store.retireStale(keeping: nil, suspend: {}) {
      if $0 == two { throw URLError(.notConnectedToInternet) }
    }
  }
  #expect(try store.read() == [two])
  var retried: [PushRegistrationRecord] = []
  try await store.retireStale(keeping: UUID(), suspend: {}) { retried.append($0) }
  #expect(retried == [two])
  #expect(try store.read().isEmpty)
}

@Test func aRestoredSessionReusesItsRegistrationIDButAnotherSignInDoesNot() throws {
  func bearer(_ subject: String, expiration: Int) -> String {
    let claims = Data("{\"sub\":\"\(subject)\",\"iat\":1,\"exp\":\(expiration)}".utf8).base64EncodedString()
    return "header.\(claims).signature"
  }
  let first = try PushTokenStore.registrationID(bearer: bearer("account|session1", expiration: 20), installSecret: "installation")
  #expect(try PushTokenStore.registrationID(bearer: bearer("account|session1", expiration: 40), installSecret: "installation") == first)
  #expect(try PushTokenStore.registrationID(bearer: bearer("account|session2", expiration: 40), installSecret: "installation") != first)
  #expect(try PushTokenStore.registrationID(bearer: bearer("another|session2", expiration: 40), installSecret: "installation") != first)
}

@MainActor @Test func anExpoUpgradeTransfersTheCachedTokenBeforeExchangeAndKeepsItOnFailure() async throws {
  let baseService = "test.shelvr.upgrade.\(UUID().uuidString)"
  let store = PushTokenStore(serviceURL: URL(string: "https://test.convex.cloud")!, keychainService: baseService + ":no-auth")
  defer { try? store.write([]); try? store.writeLegacy([], service: baseService); try? store.writeLegacy([]) }
  let generation = UUID()
  try store.writeLegacy(["old-expo"], service: baseService)
  #expect(try store.read().isEmpty)
  var events: [String] = []
  await #expect(throws: URLError.self) {
    try await store.adoptLegacy(for: generation, deviceContinuity: true, suspend: { events.append("suspend") }) { record in
      #expect(try store.read().contains(record))
      events.append("authenticated adoption")
      throw URLError(.notConnectedToInternet)
    }
  }
  #expect(try store.legacyTokens(service: baseService) == ["old-expo"])
  #expect(events == ["suspend", "authenticated adoption"])
  try await store.adoptLegacy(for: generation, deviceContinuity: true, suspend: { events.append("suspend") }) { record in
    #expect(record == PushRegistrationRecord(token: "old-expo", registrationId: generation.uuidString))
    events.append("authenticated adoption")
  }
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [UnavailableExpo.self]
  let exchange = ExpoPushRequest(bundleID: "app.shelvr.save.preview", apns: Data([1]), installation: "install", development: true)
  await #expect(throws: URLError(.badServerResponse)) { try await exchange.exchange(session: URLSession(configuration: config)) }
  #expect(try store.legacyTokens(service: baseService).isEmpty)
  #expect(try store.read() == [PushRegistrationRecord(token: "old-expo", registrationId: generation.uuidString)])
  #expect(events == ["suspend", "authenticated adoption", "suspend", "authenticated adoption"])
}

private final class UnavailableExpo: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}
  override func startLoading() {
    let response = HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocolDidFinishLoading(self)
  }
}

private func expoKey(_ value: String, service: String) -> [String: Any] {
  let bytes = Data(value.utf8)
  return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
    kSecAttrGeneric as String: bytes, kSecAttrAccount as String: bytes]
}

@MainActor @Test func backupRestoredExpoTokensCannotBeAssignedToTheNewPhonesAccount() async throws {
  let oldDevice = "test.original.\(UUID())"
  let newDevice = "test.restored.\(UUID())"
  let oldService = "test.secure.\(UUID())"
  let secretService = oldService + ":no-auth"
  let store = PushTokenStore(serviceURL: URL(string: "https://example.convex.cloud")!, keychainService: secretService)
  let deviceKey = expoKey("EXDeviceInstallationUUIDKey", service: oldDevice)
  let secretKey = expoKey("notification-install-secret", service: oldService)
  let restoredTokens = expoKey("notification-tokens-https___example.convex.cloud", service: secretService)
  defer {
    for item in [deviceKey, secretKey, restoredTokens, expoKey("notification-install-secret", service: secretService),
      expoKey("swift-notification-installation-id", service: newDevice),
      expoKey("swift-notification-installation-secret", service: newDevice + ".push-secret")] { _ = Keychain.delete(item) }
    try? store.write([])
  }
  #expect(Keychain.write(Data("ORIGINAL".utf8), to: deviceKey, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly))
  #expect(Keychain.write(Data("copied-secret".utf8), to: secretKey))
  #expect(Keychain.write(Data(#"["old-phone-token"]"#.utf8), to: restoredTokens))
  let restored = try PushInstallation(bundleID: newDevice, expoSecretService: secretService, oldSecretService: oldService)
  #expect(!restored.hasExpoDeviceIdentity && restored.id != "original" && restored.secret != "copied-secret")
  let reopened = try PushInstallation(bundleID: newDevice, expoSecretService: secretService, oldSecretService: oldService)
  #expect(!reopened.hasExpoDeviceIdentity && reopened.id == restored.id && reopened.secret == restored.secret)
  try await store.adoptLegacy(for: UUID(), deviceContinuity: reopened.hasExpoDeviceIdentity, suspend: {}) { _ in
    Issue.record("A copied token must never be registered on a restored phone")
  }
  #expect(try store.legacyTokens().isEmpty)
  #expect(try store.read().isEmpty)
  let same = try PushInstallation(bundleID: oldDevice, expoSecretService: secretService, oldSecretService: oldService)
  #expect(same.hasExpoDeviceIdentity && same.id == "original" && same.secret == "copied-secret")
}

private final class OtherPushOwner: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}
  override func startLoading() {
    let response = HTTPURLResponse(url: request.url!, statusCode: 560, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(#"{"status":"error","errorData":{"code":"notification_token_owned_by_another_account"}}"#.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
}

@MainActor @Test func permanentOwnershipRefusalKeepsTheLegacyRecordForAccountRecovery() async throws {
  let endpoint = URL(string: "https://example.convex.cloud")!
  let legacy = "test.ownership.\(UUID())"
  let store = PushTokenStore(serviceURL: endpoint, keychainService: legacy + ":no-auth")
  defer { try? store.write([]); try? store.writeLegacy([], service: legacy) }
  try store.writeLegacy(["original"], service: legacy)
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [OtherPushOwner.self]
  let transport = PushTransport(deployment: endpoint, session: URLSession(configuration: config))
  await #expect(throws: PushRegistrationError.ownedByAnotherAccount) {
    try await store.adoptLegacy(for: UUID(), deviceContinuity: true, suspend: {}) { record in
      try await transport.call("notifications:registerDevice", args: ["token": record.token,
        "installSecret": "fixture", "registrationId": record.registrationId, "platform": "ios"], bearer: "new-account")
    }
  }
  #expect(try store.legacyTokens(service: legacy) == ["original"])
}

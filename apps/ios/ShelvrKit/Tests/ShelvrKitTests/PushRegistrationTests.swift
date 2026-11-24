import Foundation
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

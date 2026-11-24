import Foundation
import Security
import Testing
@testable import ShelvrKit

@MainActor @Test func aRetryRemovesOnlyConfirmedRetiredTokensAndSkipsTheActiveDeviceCredential() async {
  var delivered: [String] = []
  var attempted: [String] = []
  let failed = await SiriRevocations.drain(pending: ["failed", "current", "retired"], active: { .active("current") }) { token in
    attempted.append(token)
    if token == "failed" { throw URLError(.notConnectedToInternet) }
  } delivered: { delivered.append($0); return true }
  #expect(failed)
  #expect(attempted == ["failed", "retired"])
  #expect(delivered == ["retired"])
  let retried = await SiriRevocations.drain(pending: ["failed", "current"], active: { .active("current") }) { _ in } delivered: {
    delivered.append($0)
    return true
  }
  #expect(!retried)
  #expect(delivered == ["retired", "failed"])
}

@Test func captureRevocationStaysOnTheIssuingDeployment() {
  #expect(SiriRevocations.site(for: URL(string: "https://first.convex.cloud/api/action")!)?.absoluteString == "https://first.convex.site")
  #expect(SiriRevocations.site(for: URL(string: "https://other.example.com")!) == nil)
}

private final class RevokeEndpointStub: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}
  override func startLoading() {
    let exact = request.url?.absoluteString == "https://example.convex.site/app-intents/revoke"
      && request.httpMethod == "POST" && request.httpBody == nil
    let status = exact && request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token" ? 204 : 404
    let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocolDidFinishLoading(self)
  }
}

@Test func retriesUseTheCaptureTokenWithoutFormerAccountAuthorization() async throws {
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [RevokeEndpointStub.self]
  let session = URLSession(configuration: config)
  let transport = ConvexHTTPAuthTransport(deployment: URL(string: "https://example.convex.cloud")!, session: session)
  try await transport.revokePresentedSiri("test-token")
  await #expect(throws: ConvexCallError.badResponse(404)) {
    try await transport.revokePresentedSiri("other-token")
  }
}

@Test func readsEveryQueuedKeychainCredentialIndividually() throws {
  let site = URL(string: "https://test-\(UUID().uuidString).convex.site")!
  let queue = SiriRevocations(site: site)
  defer { queue.delivered("a"); queue.delivered("b") }
  try queue.remember("a")
  try queue.remember("b")
  #expect(Set(try queue.pending()) == ["a", "b"])
  #expect(queue.delivered("a"))
  #expect(try queue.pending() == ["b"])
}

@Test func retainsThePresentedTokenUntilPersistenceOrRemoteRevocationSucceeds() {
  var queue = SiriRevocationBacklog()
  queue.remember("old") { _ in throw AuthSessionError.sessionStorageUnavailable }
  #expect(queue.candidates(stored: nil) == ["old"])
  queue.remember("other") { _ in throw AuthSessionError.sessionStorageUnavailable }
  queue.confirmed("old")
  #expect(queue.candidates(stored: ["disk"]) == ["other", "disk"])
  queue.remember("other") { _ in }
  #expect(queue.unpersisted.isEmpty)
  #expect(queue.candidates(stored: ["other"]) == ["other"])
}

@MainActor @Test func anUnreadableActiveSlotDoesNotRevokeAnyPendingCredential() async {
  var revoked: [String] = []
  let retry = await SiriRevocations.drain(pending: ["active", "retired"], active: { .unavailable }) {
    revoked.append($0)
  } delivered: { _ in true }
  #expect(retry)
  #expect(revoked.isEmpty)
  let complete = await SiriRevocations.drain(pending: ["active", "retired"], active: { .active("active") }) {
    revoked.append($0)
  } delivered: { _ in true }
  #expect(!complete)
  #expect(revoked == ["retired"])
}

@Test func anUnreadableExistingCredentialCannotBeOverwritten() throws {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "test.shelvr.\(UUID().uuidString)",
    kSecAttrAccount as String: "capture"
  ]
  defer { _ = Keychain.delete(query) }
  let original = Data("malformed fixture".utf8)
  #expect(Keychain.write(original, to: query))
  let replacement = SiriCredential(owner: "b", token: "new", siteURL: "https://example.convex.site", subject: "b|session")
  #expect(throws: DecodingError.self) { try SiriCredential.store(replacement, in: query) }
  #expect(try Keychain.checkedData(query) == original)
}

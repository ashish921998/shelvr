import Foundation
import Testing
@testable import ShelvrKit

@Test func aRetryRemovesOnlyConfirmedRetiredTokensAndSkipsTheActiveDeviceCredential() async {
  var delivered: [String] = []
  var attempted: [String] = []
  await SiriRevocations.drain(pending: ["failed", "current", "retired"], active: { "current" }) { token in
    attempted.append(token)
    if token == "failed" { throw URLError(.notConnectedToInternet) }
  } delivered: { delivered.append($0) }
  #expect(attempted == ["failed", "retired"])
  #expect(delivered == ["retired"])
  await SiriRevocations.drain(pending: ["failed", "current"], active: { "current" }) { _ in } delivered: {
    delivered.append($0)
  }
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

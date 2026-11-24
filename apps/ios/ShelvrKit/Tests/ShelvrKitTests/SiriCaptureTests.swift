import Foundation
import ShelvrInbox
import Testing
@testable import ShelvrKit

@Test func siriRetryKeepsTheOriginalOperationAndSource() throws {
  let pending = InboxPayload(kind: .note, value: "test note", operationID: "siri:fixture", siri: true)
  let saved = try JSONDecoder().decode(InboxPayload.self, from: JSONEncoder().encode(pending))
  #expect(saved.operationID == "siri:fixture")
  #expect(saved.kind == .note)
  #expect(saved.siri == true)
  let old = Data(#"{"kind":"link","value":"https://example.com","operationID":"share:old"}"#.utf8)
  #expect(try JSONDecoder().decode(InboxPayload.self, from: old).siri == nil)
}

@Test func captureCredentialsFollowTheAuthenticatedSessionSubject() throws {
  func jwt(_ claims: String) -> String {
    "header." + Data(claims.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "") + ".signature"
  }
  #expect(JWT.claims(of: jwt(#"{"sub":"person|session","exp":2,"iat":1}"#))?.sub == "person|session")
  #expect(JWT.claims(of: jwt(#"{"exp":2,"iat":1}"#))?.sub == nil)
}

@MainActor @Test func rollsBackIssuedCredentialWhenKeychainRefusesIt() async {
  var revoked = 0
  await #expect(throws: AuthSessionError.sessionStorageUnavailable) {
    try await Backend.installSiri({ throw AuthSessionError.sessionStorageUnavailable }, revokeOnFailure: { revoked += 1 })
  }
  #expect(revoked == 1)
  try? await Backend.installSiri({}, revokeOnFailure: { revoked += 1 })
  #expect(revoked == 1)
}

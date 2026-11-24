import Foundation
import Testing

@testable import ShelvrKit

struct SignInCredentialTests {
  @Test func appleSendsTheTokenNonceNameAndCode() {
    var name = PersonNameComponents()
    name.givenName = "Priya"
    name.familyName = "Shah"
    let credential = SignInCredential.apple(
      identityToken: Data("token".utf8), nonce: "raw-nonce", fullName: name,
      authorizationCode: Data("code".utf8))
    #expect(
      credential?.request
        == SignInRequest(
          provider: "apple-native",
          params: [
            "identityToken": "token", "nonce": "raw-nonce", "name": "Priya Shah",
            "authorizationCode": "code",
          ]))
  }

  @Test func appleLeavesOutAMissingNameAndCode() {
    var name = PersonNameComponents()
    name.givenName = ""
    let credential = SignInCredential.apple(
      identityToken: Data("token".utf8), nonce: "raw-nonce", fullName: name,
      authorizationCode: nil)
    #expect(
      credential?.request
        == SignInRequest(
          provider: "apple-native", params: ["identityToken": "token", "nonce": "raw-nonce"]))
  }

  @Test func appleWithoutAnIdentityTokenIsNoCredential() {
    #expect(
      SignInCredential.apple(
        identityToken: nil, nonce: "raw-nonce", fullName: nil, authorizationCode: nil) == nil)
    #expect(
      SignInCredential.apple(
        identityToken: Data([0xFF]), nonce: "raw-nonce", fullName: nil, authorizationCode: nil)
        == nil)
  }

  @Test func oauthCallbackSendsItsCodeWithTheStartVerifier() throws {
    let start = OAuthStart(url: URL(string: "https://example.com/start")!, verifier: "verifier")
    let credential = try SignInCredential.oauthCode(
      provider: "google", callback: URL(string: "shelvr://?code=abc&state=x")!, start: start)
    #expect(credential == .oauthCode(provider: "google", code: "abc", verifier: "verifier"))
  }

  @Test func oauthCallbackWithoutACodeIsRefused() {
    let start = OAuthStart(url: URL(string: "https://example.com/start")!, verifier: "verifier")
    #expect(throws: AuthSessionError.signInRefused) {
      try SignInCredential.oauthCode(
        provider: "google", callback: URL(string: "shelvr://?error=access_denied")!, start: start)
    }
  }
}

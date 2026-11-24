import Foundation

extension SignInCredential {
  public static func apple(
    identityToken: Data?, nonce: String, fullName: PersonNameComponents?, authorizationCode: Data?
  ) -> SignInCredential? {
    guard let token = identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else {
      return nil
    }
    let name = [fullName?.givenName, fullName?.familyName]
      .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    return .apple(
      identityToken: token,
      nonce: nonce,
      name: name,
      authorizationCode: authorizationCode.flatMap { String(data: $0, encoding: .utf8) })
  }

  public static func oauthCode(provider: String, callback: URL, start: OAuthStart) throws
    -> SignInCredential
  {
    guard
      let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "code" })?.value
    else { throw AuthSessionError.signInRefused }
    return .oauthCode(provider: provider, code: code, verifier: start.verifier)
  }
}

import AuthenticationServices
import ShelvrKit
import SwiftUI

struct SignInView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @Environment(\.colorScheme) private var colorScheme
  @State private var nonce = AppleNonce()
  @State private var busy = false
  @State private var failed = false

  var body: some View {
    VStack(spacing: 16) {
      Spacer()
      Text("Shelvr")
        .font(.system(size: 48, weight: .bold))
      Text(copy("opener.tagline"))
        .font(.title3.weight(.semibold))
        .multilineTextAlignment(.center)
      Text(copy("account.signInTitle"))
        .foregroundStyle(Color(.muted))
        .multilineTextAlignment(.center)
      Spacer()
      SignInWithAppleButton(.continue) { request in
        nonce = AppleNonce()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce.hashed
      } onCompletion: { result in
        switch result {
        case let .success(authorization):
          guard let credential = appleCredential(authorization) else {
            failed = true
            return
          }
          signIn { try await backend.signIn(credential) }
        case let .failure(error):
          failed = (error as? ASAuthorizationError)?.code != .canceled
        }
      }
      .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
      .frame(height: 52)
      Button(copy("account.google")) {
        signIn {
          guard let credential = try await googleCredential() else { return }
          try await backend.signIn(credential)
        }
      }
      .buttonStyle(.signIn)
      #if DEBUG
        Button(copy("account.anonymous")) {
          signIn { try await backend.signIn(.anonymous) }
        }
        .buttonStyle(.signIn)
      #endif
      if busy {
        ProgressView()
      } else if failed {
        Text(copy("account.signInNotFinished"))
          .font(.footnote)
          .foregroundStyle(.red)
      }
      Text(consent)
        .font(.caption)
        .foregroundStyle(Color(.muted))
        .multilineTextAlignment(.center)
        .tint(Color(.foreground))
    }
    .padding(24)
    .disabled(busy)
  }

  private var consent: AttributedString {
    let terms = "\u{E000}", privacy = "\u{E001}"
    var text = AttributedString(copy("legal.consent", ["terms": terms, "privacy": privacy]))
    for (marker, key, url) in [
      (terms, "legal.terms", "https://tryshelvr.app/terms"),
      (privacy, "legal.privacy", "https://tryshelvr.app/privacy"),
    ] {
      guard let range = text.range(of: marker) else { continue }
      var link = AttributedString(copy(key))
      link.link = URL(string: url)
      link.underlineStyle = .single
      text.replaceSubrange(range, with: link)
    }
    return text
  }

  private func signIn(_ work: @escaping @MainActor () async throws -> Void) {
    busy = true
    failed = false
    Task {
      defer { busy = false }
      do { try await work() } catch { failed = true }
    }
  }

  private func appleCredential(_ authorization: ASAuthorization) -> SignInCredential? {
    guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential else {
      return nil
    }
    return .apple(
      identityToken: apple.identityToken, nonce: nonce.raw, fullName: apple.fullName,
      authorizationCode: apple.authorizationCode)
  }

  private func googleCredential() async throws -> SignInCredential? {
    let start = try await backend.startOAuth(provider: "google")
    let callback: URL
    do {
      callback = try await webAuthenticationSession.authenticate(
        using: start.url,
        callback: .customScheme(backend.environment.urlScheme),
        additionalHeaderFields: [:])
    } catch ASWebAuthenticationSessionError.canceledLogin {
      return nil
    }
    return try .oauthCode(provider: "google", callback: callback, start: start)
  }
}

extension ButtonStyle where Self == SignInButtonStyle {
  static var signIn: SignInButtonStyle { SignInButtonStyle() }
}

struct SignInButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .frame(maxWidth: .infinity, minHeight: 52)
      .background(Color(.foreground).opacity(0.08), in: .rect(cornerRadius: 12))
      .opacity(configuration.isPressed ? 0.7 : 1)
  }
}

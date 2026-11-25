import AuthenticationServices
import ShelvrKit
import SwiftUI

struct SignInView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.dynamicTypeSize) private var type
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var nonce = AppleNonce()
  @State private var busy = false
  @State private var attemptID = ""
  @State private var stage = "request"
  @State private var browserBegan: Date?
  @State private var began = Date()
  @State private var provider = ""
  @State private var failed = false

  var body: some View {
    let palette = HomeChromePalette(colorScheme, appearance: appearance)
    GeometryReader { proxy in
      ScrollView {
        VStack(spacing: 16) {
          if !type.isAccessibilitySize {
            LisbonSignInHero(palette: palette)
              .frame(height: max(145, min(345, proxy.size.height - 375)))
          }
          VStack(spacing: 6) {
            Text("shelvr").font(.custom("CrimsonProRoman-Regular", size: 32, relativeTo: .title))
              .foregroundStyle(palette.primaryText).accessibilityAddTraits(.isHeader)
            Text(copy("opener.tagline")).font(.custom("CrimsonProRoman-Regular", size: 30, relativeTo: .title))
            Text(copy("account.signInTitle"))
              .font(.custom("Satoshi-Regular", size: 16, relativeTo: .body)).foregroundStyle(palette.muted)
          }.multilineTextAlignment(.center)
          providerButtons(palette)
          Text(consent).font(.custom("Satoshi-Regular", size: 12, relativeTo: .caption))
            .foregroundStyle(palette.muted).multilineTextAlignment(.center).tint(palette.foreground)
        }.padding(.horizontal, 20).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: proxy.size.height)
      }
    }.background(palette.background.ignoresSafeArea()).foregroundStyle(palette.foreground).disabled(busy)
  }

  private func providerButtons(_ palette: HomeChromePalette) -> some View {
    VStack(spacing: 12) {
      SignInWithAppleButton(.continue) { request in
        begin("apple"); stage = "browser"; browserBegan = .now
        nonce = AppleNonce()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce.hashed
      } onCompletion: { result in
        switch result {
        case let .success(authorization):
          guard let credential = appleCredential(authorization) else {
            failed = true; outcome("auth_failed", ["stage": "request"])
            return
          }
          stage = "exchange"
          signIn { try await backend.signIn(credential) }
        case let .failure(error):
          failed = (error as? ASAuthorizationError)?.code != .canceled
          if failed { outcome("auth_failed", ["stage": "browser"]) } else { cancelled() }
        }
      }
      .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
      .frame(height: 52).clipShape(Capsule())
      Button {
        begin("google")
        signIn {
          guard let credential = try await googleCredential() else { cancelled(); return }
          stage = "exchange"
          try await backend.signIn(credential)
        }
      } label: {
        Text(copy("account.google")).font(.custom("Satoshi-Bold", size: 16, relativeTo: .headline))
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(palette.surface, in: Capsule()).overlay { Capsule().strokeBorder(palette.border) }
      }
      .buttonStyle(.plain)
      #if DEBUG
        Button {
          begin("anonymous")
          signIn { try await backend.signIn(.anonymous) }
        } label: {
          Text(copy("account.anonymous")).font(.custom("Satoshi-Regular", size: 14, relativeTo: .subheadline))
            .foregroundStyle(palette.muted).frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(.plain)
      #endif
      if busy {
        ProgressView()
      } else if failed {
        Text(copy("account.signInNotFinished"))
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
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

  private func begin(_ provider: String) {
    self.provider = provider; stage = "request"; browserBegan = nil; began = .now; attemptID = UUID().uuidString
    Analytics.capture("auth_started", authProperties)
  }

  private var authProperties: [String: Any] {
    ["provider": provider, "method": provider == "google" ? "web" : "native",
      "surface": "sign_in_view", "auth_attempt_id": attemptID]
  }

  private func outcome(_ name: String, _ fields: [String: Any] = [:]) {
    guard !attemptID.isEmpty else { return }
    var properties = authProperties.merging(fields) { $1 }
    properties["elapsed_ms"] = max(0, Int(Date.now.timeIntervalSince(began) * 1000))
    Analytics.capture(name, properties)
    attemptID = ""
  }

  private func cancelled() {
    outcome("auth_cancelled", ["result": "cancel", "browser_ms": max(0, Int(Date.now.timeIntervalSince(browserBegan ?? began) * 1000))])
  }

  private func signIn(_ work: @escaping @MainActor () async throws -> Void) {
    busy = true
    failed = false
    Task {
      defer { busy = false }
      do {
        try await work()
        if backend.status == .signedIn { outcome("auth_succeeded") }
        else if !attemptID.isEmpty { outcome("auth_failed", ["stage": stage]) }
      } catch {
        outcome("auth_failed", ["stage": stage]); failed = true
      }
    }
  }

  private func appleCredential(_ authorization: ASAuthorization) -> SignInCredential? {
    guard
      let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
      let identityToken = apple.identityToken.flatMap({ String(data: $0, encoding: .utf8) })
    else { return nil }
    let name = [apple.fullName?.givenName, apple.fullName?.familyName]
      .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    return .apple(
      identityToken: identityToken,
      nonce: nonce.raw,
      name: name,
      authorizationCode: apple.authorizationCode.flatMap { String(data: $0, encoding: .utf8) })
  }

  private func googleCredential() async throws -> SignInCredential? {
    let start = try await backend.startOAuth(provider: "google")
    stage = "browser"; browserBegan = .now
    let callback: URL
    do {
      callback = try await webAuthenticationSession.authenticate(
        using: start.url,
        callback: .customScheme(backend.environment.urlScheme),
        additionalHeaderFields: [:])
    } catch ASWebAuthenticationSessionError.canceledLogin {
      return nil
    }
    guard
      let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "code" })?.value
    else { throw AuthSessionError.signInRefused }
    return .oauthCode(provider: "google", code: code, verifier: start.verifier)
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

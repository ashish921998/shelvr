import Foundation
import Security
import Synchronization
import Testing

@testable import ShelvrKit

struct ConfigTests {
  let dev = URL(string: "https://amicable-antelope-639.convex.cloud")!

  @Test func developmentBuildsRefuseTheProductionDeployment() {
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(variant: .development, convexURL: AppEnvironment.productionConvexURL, bundleID: "app.shelvr.save.preview")
    }
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(variant: .development, convexURL: URL(string: "https://AMIABLE-SETTER-120.convex.cloud")!, bundleID: "app.shelvr.save.preview")
    }
  }

  @Test func productionBuildsRefuseAnyOtherDeployment() {
    #expect(throws: AppEnvironment.ConfigError.productionUsesOtherDeployment(dev.absoluteString)) {
      try AppEnvironment(variant: .production, convexURL: dev, bundleID: "app.shelvr.save")
    }
  }

  @Test func infoDictionaryWithoutAVariantIsTreatedAsDevelopment() throws {
    let env = try AppEnvironment(infoDictionary: ["CFBundleIdentifier": "app.shelvr.save.dev", "ShelvrConvexURL": dev.absoluteString])
    #expect(env.variant == .development)
    #expect(env.oauthRedirect.absoluteString == "shelvr-preview://auth/callback")
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(infoDictionary: ["ShelvrConvexURL": "https://amiable-setter-120.convex.cloud"])
    }
  }

  @Test func missingBundleIdentityIsAConfigError() {
    #expect(throws: AppEnvironment.ConfigError.missingBundleID) {
      try AppEnvironment(infoDictionary: ["ShelvrConvexURL": dev.absoluteString])
    }
  }

  @Test func missingURLIsAConfigError() {
    #expect(throws: AppEnvironment.ConfigError.missingConvexURL) {
      try AppEnvironment(infoDictionary: ["ShelvrConvexURL": "$(SHELVR_CONVEX_URL)"])
    }
  }

  @Test func legacyExpoKeyMatchesTheConvexAuthStorageLayout() {
    let legacy = LegacyExpoSession(convexURL: AppEnvironment.productionConvexURL)
    let prefix = "https___amiable-setter-120.convex.cloud"
    let namespace = "httpsamiablesetter120convexcloud"
    #expect(legacy.account(for: .refreshToken) == "\(prefix)___convexAuthRefreshToken_\(namespace)")
    #expect(legacy.account(for: .jwt) == "\(prefix)___convexAuthJWT_\(namespace)")
    #expect(legacy.account(for: .oauthVerifier) == "\(prefix)___convexAuthOAuthVerifier_\(namespace)")
    #expect(legacy.account(for: .serverStateFetchTime) == "\(prefix)___convexAuthServerStateFetchTime_\(namespace)")
  }

  @Test func legacyHandoffStopsAtAClearedTokenAndForgetsEveryKeyInBothServices() {
    let url = AppEnvironment.productionConvexURL
    let deleted = Mutex<[String]>([])
    let store = ExpoSecureStore(
      deployment: url,
      read: { query in
        switch query[kSecAttrService as String] as? String {
        case "app:no-auth": Data()
        case "app": Data("legacy-refresh".utf8)
        default: nil
        }
      },
      remove: { query in
        let service = query[kSecAttrService as String] as? String ?? ""
        let key = (query[kSecAttrAccount as String] as? Data).map { String(decoding: $0, as: UTF8.self) } ?? ""
        deleted.withLock { $0.append("\(service)|\(key)") }
        return true
      })
    let legacy = LegacyExpoSession(convexURL: url, store: store)
    #expect(legacy.refreshToken() == nil)
    #expect(legacy.forget())
    let expected = LegacyExpoSession.Entry.allCases.flatMap { entry in
      ["app:no-auth", "app"].map { "\($0)|\(legacy.account(for: entry))" }
    }
    #expect(deleted.withLock { $0 } == expected)
  }

  @Test func jwtLifetimeComesFromItsClaims() {
    #expect(AuthTokens(token: jwt(lifetime: 3600), refreshToken: "r").lifetime == 3600)
    #expect(AuthTokens(token: "", refreshToken: "r").lifetime == nil)
  }

  @Test func appleNonceIsHashedWithSHA256() {
    #expect(
      AppleNonce(raw: "abc").hashed
        == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  }
}

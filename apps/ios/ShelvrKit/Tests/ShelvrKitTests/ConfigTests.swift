import Foundation
import Testing

@testable import ShelvrKit

struct ConfigTests {
  let dev = URL(string: "https://amicable-antelope-639.convex.cloud")!

  @Test func developmentBuildsRefuseTheProductionDeployment() {
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(variant: .development, convexURL: AppEnvironment.productionConvexURL)
    }
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(variant: .development, convexURL: URL(string: "https://AMIABLE-SETTER-120.convex.cloud")!)
    }
  }

  @Test func productionBuildsRefuseAnyOtherDeployment() {
    #expect(throws: AppEnvironment.ConfigError.productionUsesOtherDeployment(dev.absoluteString)) {
      try AppEnvironment(variant: .production, convexURL: dev)
    }
  }

  @Test func infoDictionaryWithoutAVariantIsTreatedAsDevelopment() throws {
    let env = try AppEnvironment(infoDictionary: ["ShelvrConvexURL": dev.absoluteString])
    #expect(env.variant == .development)
    #expect(env.oauthRedirect.absoluteString == "shelvr-preview://auth/callback")
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(infoDictionary: ["ShelvrConvexURL": "https://amiable-setter-120.convex.cloud"])
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

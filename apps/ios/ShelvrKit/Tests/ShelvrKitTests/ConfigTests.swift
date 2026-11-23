import Foundation
import Testing

@testable import ShelvrKit

struct ConfigTests {
  let dev = URL(string: "https://amicable-antelope-639.convex.cloud")!

  @Test func developmentBuildsRefuseTheProductionDeployment() {
    #expect(throws: AppEnvironment.ConfigError.developmentUsesProduction) {
      try AppEnvironment(variant: .development, convexURL: AppEnvironment.productionConvexURL)
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
    #expect(
      legacy.matches(
        account:
          "https___amiable-setter-120.convex.cloud___convexAuthRefreshToken_httpsamiablesetter120convexcloud"
      ))
    #expect(
      legacy.matches(
        account:
          "https___amiable-setter-120.convex.cloud___convexAuthJWT_httpsamiablesetter120convexcloud"
      ) == false)
    #expect(
      legacy.matches(
        account:
          "https___amicable-antelope-639.convex.cloud___convexAuthRefreshToken_httpsamicableantelope639convexcloud"
      ) == false)
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

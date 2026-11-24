import Foundation

public struct AppEnvironment: Sendable, Equatable {
  public enum Variant: String, Sendable {
    case development
    case production
  }

  public enum ConfigError: Error, Equatable {
    case missingBundleID
    case missingConvexURL
    case developmentUsesProduction
    case productionUsesOtherDeployment(String)
  }

  public static let productionConvexURL = URL(string: "https://amiable-setter-120.convex.cloud")!

  public let bundleID: String
  public var appGroup: String { "group.\(bundleID)" }

  public let variant: Variant
  public let convexURL: URL

  public init(variant: Variant, convexURL: URL, bundleID: String) throws(ConfigError) {
    let isProductionURL = convexURL.host()?.lowercased() == Self.productionConvexURL.host()
    switch variant {
    case .development where isProductionURL:
      throw .developmentUsesProduction
    case .production where !isProductionURL:
      throw .productionUsesOtherDeployment(convexURL.absoluteString)
    default:
      break
    }
    guard !bundleID.isEmpty else { throw .missingBundleID }
    self.bundleID = bundleID
    self.variant = variant
    self.convexURL = convexURL
  }

  public init(infoDictionary: [String: Any]) throws(ConfigError) {
    guard
      let raw = infoDictionary["ShelvrConvexURL"] as? String,
      let url = URL(string: raw), url.host() != nil
    else { throw .missingConvexURL }
    let variant = Variant(rawValue: infoDictionary["ShelvrVariant"] as? String ?? "") ?? .development
    try self.init(
      variant: variant, convexURL: url,
      bundleID: infoDictionary["CFBundleIdentifier"] as? String ?? "")
  }

  public var urlScheme: String {
    variant == .production ? "shelvr" : "shelvr-preview"
  }

  public var oauthRedirect: URL {
    URL(string: "\(urlScheme)://auth/callback")!
  }
}

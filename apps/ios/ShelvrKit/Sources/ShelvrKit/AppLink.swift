import Foundation

public struct AppLink: Hashable, Sendable {
  public let path: [String]
  public let query: [URLQueryItem]
  public let fragment: String?

  public init?(_ input: String, onboarded: Bool? = nil) {
    guard let url = URLComponents(string: input),
      url.user == nil, url.password == nil, url.port == nil
    else { return nil }

    var parts = url.percentEncodedPath.split(separator: "/").map(String.init)
    let scheme = url.scheme?.lowercased()
    let web = scheme == "https"
    switch scheme {
    case "https":
      guard ["tryshelvr.app", "shelvr-web.vercel.app"].contains(url.host?.lowercased() ?? "")
      else { return nil }
    case "shelvr", "shelvr-preview", "shelvr-dev":
      if let host = url.percentEncodedHost, !host.isEmpty { parts.insert(host, at: 0) }
    case nil:
      guard input.hasPrefix("/"), !input.hasPrefix("//") else { return nil }
    default:
      return nil
    }

    let decoded = parts.compactMap { $0.removingPercentEncoding }
    guard decoded.count == parts.count else { return nil }
    var route = decoded[...]
    if route.first == "(app)" { route = route.dropFirst() }
    if route.first == "(tabs)" { route = route.dropFirst() }

    var keepParameters = true
    let retired = ["(spaces)", "(search)", "spaces", "search", "space", "digest",
      "new-space", "manage-spaces", "camera", "trip", "plan"]
    if let first = route.first, retired.contains(first) {
      path = ["home"]
      keepParameters = false
    } else if route.isEmpty {
      path = ["map"]
    } else if route.count == 1, let first = route.first,
      ["(map)", "(home)", "(passport)", "(trips)"].contains(first)
    {
      path = [String(first.dropFirst().dropLast())]
    } else if route.elementsEqual(["auth", "callback"]) {
      path = ["sign-in"]
      keepParameters = false
    } else if !web, url.host == "expo-sharing" {
      path = [onboarded == false ? "onboarding" : "share"]
      keepParameters = false
    } else if route.count == 2, let token = route.last,
      route.first == "l" || (web && route.first == "passport")
    {
      path = [route.first == "l" ? "list-invite" : "passport-invite", token]
      keepParameters = false
    } else {
      path = Array(route)
    }
    query = keepParameters ? url.queryItems ?? [] : []
    fragment = keepParameters ? url.fragment : nil
  }
}

import Foundation
import Testing
@testable import ShelvrKit

@Test func resolvesInstalledAppLinks() {
  let cases: [([String], [String])] = [
    (["/", "shelvr://", "shelvr:///", "/map/", "/(map)", "/(app)/(tabs)/(map)"], ["map"]),
    (["/space/abc", "/digest/d1?from=push", "/(app)/(tabs)/(spaces)", "/(tabs)/(search)",
      "/new-space", "/manage-spaces?itemId=1", "/camera", "/trip/abc", "/plan/abc",
      "/(app)/plan/abc", "shelvr://space/abc", "shelvr-dev:///digest/d1?x=1"], ["home"]),
    (["/passport", "/(passport)", "/(app)/(tabs)/(passport)"], ["passport"]),
    (["shelvr://auth/callback?code=test", "shelvr-preview:///auth/callback?code=test",
      "https://tryshelvr.app/auth/callback", "https://shelvr-web.vercel.app/auth/callback"], ["sign-in"]),
    (["https://tryshelvr.app/l/token/", "shelvr:///l/token", "shelvr://list-invite/token"], ["list-invite", "token"]),
    (["https://shelvr-web.vercel.app/passport/token", "shelvr://passport-invite/token"], ["passport-invite", "token"]),
    (["shelvr://expo-sharing"], ["share"]),
    (["/trip-plan/abc"], ["trip-plan", "abc"]),
    (["/passport/abc"], ["passport", "abc"]),
    (["/city/New%20York"], ["city", "New York"]),
    (["/item/abc"], ["item", "abc"])
  ]
  for (inputs, expected) in cases {
    for input in inputs { #expect(AppLink(input)?.path == expected) }
  }
  for name in ["spaceship", "maple", "planner", "add", "passport-card", "date-plan", "plan-gate"] {
    #expect(AppLink("/" + name)?.path == [name])
  }
  #expect(AppLink("shelvr://expo-sharing", onboarded: false)?.path == ["onboarding"])
}

@Test func carriesNavigationParametersOnly() {
  #expect(AppLink("/?city=A%2BB&city=Lisbon#x")?.query == [
    URLQueryItem(name: "city", value: "A+B"), URLQueryItem(name: "city", value: "Lisbon")
  ])
  #expect(AppLink("/#x")?.fragment == "x")
  #expect(AppLink("shelvr://auth/callback?code=test")?.query == [])
  #expect(AppLink("shelvr://digest/abc?from=push")?.query == [])
  for input in ["https://example.com/auth/callback", "http://tryshelvr.app/l/t", "//example.com", "random"] {
    #expect(AppLink(input) == nil)
  }
}

@Test func passportAndListActionLinksKeepTheirDestinationArguments() {
  let routes = ["already-been", "next-to-stamp", "city-stamps", "city-card", "add-list-place"]
  for route in routes {
    let link = AppLink("shelvr-preview:///" + route + "?city=New%20York&listId=ref")
    #expect(link?.path == [route])
    #expect(link?.query.first { $0.name == "city" }?.value == "New York")
    #expect(link?.query.first { $0.name == "listId" }?.value == "ref")
  }
}

import Foundation
import Testing
@testable import ShelvrKit

private func save(_ extra: String = "", status: String = "ready") throws -> LibrarySave {
  let json = #"{"_id":"a","_creationTime":1000,"type":"note","status":"\#(status)"\#(extra)}"#
  return try JSONDecoder().decode(LibrarySave.self, from: Data(json.utf8))
}

@Test func itemAnalyticsMatchesExpoProperties() throws {
  let properties = try #require(ItemAnalytics.properties(try save(), now: Date(timeIntervalSince1970: 4)))
  #expect(properties["item_id"] as? String == "a" && properties["item_type"] as? String == "note")
  #expect(properties["saved_at"] as? Double == 1000 && properties["item_age_ms"] as? Double == 3000)
  #expect(ItemAnalytics.properties(try save(#","fixtureKey":"demo""#)) == nil)
  #expect(ItemAnalytics.source("home") == "home" && ItemAnalytics.source("x") == "direct" && ItemAnalytics.source(nil) == "direct")
}

@Test func spotSkipReasonsMatchExpo() throws {
  #expect(SaveSpotReveal.skipReason(save: nil, loaded: true, waited: 0) == "missing")
  #expect(SaveSpotReveal.skipReason(save: nil, loaded: false, waited: 30) == "timeout")
  #expect(SaveSpotReveal.skipReason(save: try save(status: "failed"), loaded: true, waited: 1) == "failed")
  #expect(SaveSpotReveal.skipReason(save: try save(), loaded: true, waited: 1) == "no_place")
  #expect(SaveSpotReveal.skipReason(save: try save(status: "processing"), loaded: true, waited: 30) == "timeout")
}

@Test func imageFailureReasonsMatchExpo() {
  #expect(SaveFailure.photoLimit.imageReason == "photo_limit" && SaveFailure.photoTooLarge.imageReason == "too_large")
  #expect(SaveFailure.proRequired.imageReason == "other" && SaveFailure.photoEmpty.imageReason == "other")
}

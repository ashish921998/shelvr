import Foundation
import Testing
@testable import ShelvrKit

@Test func mapPlaceRulesMatchExpo() throws {
  struct Golden: Decodable {
    let saved, discover: [MapPlace]
    let visits: [MapVisit]
    let beside, kinds, went: [String]
    let emoji: [String?]
  }
  let file = try #require(Bundle.module.url(forResource: "map-places", withExtension: "json"))
  let golden = try JSONDecoder().decode(Golden.self, from: Data(contentsOf: file))
  let entries = MapPlace.combined(saved: golden.saved, discover: golden.discover)
  #expect(entries.compactMap(\._id) == golden.beside)
  #expect(MapPlace.filterKinds(entries, selected: []) == golden.kinds)
  #expect(golden.saved.map(\.emoji) == golden.emoji)
  let visited = MapVisit.visitedIDs(golden.visits, among: golden.saved)
  #expect(golden.saved.filter { visited.contains($0.id) }.compactMap(\.itemId) == golden.went)
}

@Test func nameMatchesAppearAheadOfCityMatchesBeforeTruncation() throws {
  let rows = (1...6).map { i in
    ["itemId": String(i), "name": i == 6 ? "Café Berlin" : "Spot", "city": "Cafe town",
      "lat": 0.0, "lng": 0.0, "kinds": []] as [String: Any]
  }
  let places = try JSONDecoder().decode([MapPlace].self, from: JSONSerialization.data(withJSONObject: rows))
  #expect(MapPlace.search(places, query: "cafe").prefix(5).compactMap(\.itemId) == ["6", "1", "2", "3", "4"])
}

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

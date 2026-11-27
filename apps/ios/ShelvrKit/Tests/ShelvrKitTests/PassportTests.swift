import Foundation
import Testing
@testable import ShelvrKit

private func stamp(_ name: String, _ city: String?, _ country: String? = nil,
  backfilled: Bool = false) -> PassportStamp {
  PassportStamp(key: name, name: name, itemId: nil, listPlaceId: nil, city: city,
    countryCode: country, source: nil, cover: nil, lat: nil, lng: nil, visitedAt: 1000, backfilled: backfilled)
}

@Test func groupsInPassportOrderWithWaitingCitiesLast() {
  let stamps = [stamp("A", nil), stamp("B", "  SAN  Francisco "), stamp("C", "San Francisco")]
  let rows = [PassportCompletion(city: "San Francisco", stamped: 2, total: 3),
    PassportCompletion(city: "Paris", stamped: 0, total: 1),
    PassportCompletion(city: "Lisbon", stamped: 1, total: 2)]
  let sections = PassportSection.sections(stamps: stamps, completion: rows)
  #expect(sections.map(\.id) == ["san francisco", "lisbon", "", "paris"])
  #expect(sections.first?.city == "San Francisco")
  #expect(sections.first?.places.map(\.name) == ["B", "C"])
}

@Test func cityStampsMatchAliasesOnlyInTheirCountry() {
  let stamps = [stamp("A", "Lisboa", "PT"), stamp("B", "Paris", "US")]
  let cityStamps = ["lisbon", "paris", "lisbon", "unknown"].map {
    PassportCityStamp(city: $0, country: $0 == "lisbon" ? "PT" : "FR", stampedAt: 1000)
  }
  let counts = StampCity.counts(places: stamps, stamps: cityStamps)
  #expect(counts.cities == 3)
  #expect(counts.countries == 3)
}

@Test func shareCardKeepsFirstSixAndSkipsBackfilledDates() throws {
  let places = (1...8).map { stamp(String($0), "Roma", backfilled: $0 < 3) }
  let section = try #require(PassportSection.sections(stamps: places, completion: []).first)
  #expect(section.cardPlaces.map(\.name) == ["1","2","3","4","5","6"])
  #expect(section.month == Date(timeIntervalSince1970: 1))
}

@Test func matchingCityStampsHeadSectionsAndNamesakesStaySeparate() {
  let stamps = [stamp("A", "Lisboa", "PT"), stamp("B", "Paris", "US")]
  let cities = [PassportCityStamp(city: "lisbon", country: "PT", stampedAt: 1),
    PassportCityStamp(city: "paris", country: "FR", stampedAt: 1)]
  let pages = PassportPages(stamps: stamps, completion: [], cities: cities)
  #expect(pages.sections.map { $0.cityStamp?.id } == ["lisbon", nil])
  #expect(pages.standalone.map(\.id) == ["paris"])
}

@Test func passportStoryMatchesExpoVector() throws {
  struct Vector: Decodable {
    struct Expected: Decodable {
      let places, cities, countries, more: Int
      let photos, cityNames: [String]
      let fromReels: Bool
    }
    let stamps: [PassportStamp]
    let cities: [PassportCityStamp]
    let expected: Expected
  }
  let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().appending(path: "TestData/passport-story.json")
  let vector = try JSONDecoder().decode(Vector.self, from: Data(contentsOf: file))
  let story = PassportStory(places: vector.stamps, cities: vector.cities) { _ in "Lisboa" }
  #expect(story.places == vector.expected.places)
  #expect(story.cities == vector.expected.cities)
  #expect(story.countries == vector.expected.countries)
  #expect(story.photos.map(\.name) == vector.expected.photos)
  #expect(story.cityNames == vector.expected.cityNames)
  #expect(story.more == vector.expected.more)
  #expect(story.fromReels == vector.expected.fromReels)
}

@Test func stampCatalogLooksAreDistinctEnough() {
  let catalog = StampCity.catalog
  #expect(catalog.count == 25)
  #expect(catalog.allSatisfy { (0..<6).contains($0.look.ink) })
  let shared = Dictionary(grouping: catalog, by: \.look).values.filter { $0.count > 1 }
  #expect(shared.count <= 1)
  #expect(shared.allSatisfy { $0.count == 2 })
  for (a, b) in zip(catalog, catalog.dropFirst()) { #expect(a.look.ink != b.look.ink) }
  let byID = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0.look) })
  for pair in [("rome", "milan"), ("rome", "florence"), ("milan", "florence")] {
    #expect(byID[pair.0]!.ink != byID[pair.1]!.ink)
    #expect(byID[pair.0]!.shape != byID[pair.1]!.shape)
  }
  for group in Dictionary(grouping: catalog, by: \.country).values {
    #expect(Set(group.map(\.look)).count == group.count)
  }
}

@Test func contourLoopsAreSeededAndClosed() {
  let loops = ContourLoops.loops(seed: 7)
  #expect(loops == ContourLoops.loops(seed: 7))
  #expect(loops != ContourLoops.loops(seed: 8))
  #expect(loops.count == ContourLoops.loopCount)
  #expect(loops.allSatisfy { $0.first == $0.last && $0.count == ContourLoops.pointCount + 1 })
}

import Foundation
import Testing
@testable import ShelvrKit

private struct MapParity: Decodable {
  let categories, cuisines: [String: String]
  let namesByCuisine: [String: [String]]
  let pins: [Pin]
  let places: [Place]
  let search: [Search]
  let reach: [Reach]

  struct Pin: Decodable {
    let name: String
    let category, cuisine, emoji: String?
    let kinds: [String]?
  }
  struct Place: Decodable {
    enum Source: String, Decodable { case own, discover }
    let source: Source
    let name, city: String
    let features: [String]?
  }
  struct Search: Decodable { let query: String; let names: [String] }
  struct Reach: Decodable { let latitude, longitude: Double; let box, expected: DiscoverBox }

  static func load() throws -> MapParity {
    let url = try #require(Bundle.module.url(forResource: "map-parity", withExtension: "json"))
    return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
  }
}

@Test func mapGlyphsMatchExpoCategoriesCuisinesAndNames() throws {
  let fixture = try MapParity.load()
  func glyph(_ name: String = "", category: String? = nil, cuisine: String? = nil, kinds: [String] = []) -> String? {
    MapPlace(source: .saved(itemID: "pin"), name: name, lat: 0, lng: 0, appleId: nil, city: nil,
      category: category, cuisine: cuisine, kinds: kinds.compactMap(PlaceKind.init(rawValue:))).emoji
  }
  for (category, expected) in fixture.categories { #expect(glyph(category: category) == expected) }
  for (cuisine, expected) in fixture.cuisines { #expect(glyph(category: "Restaurant", cuisine: cuisine) == expected) }
  for (cuisine, names) in fixture.namesByCuisine {
    let expected = try #require(fixture.cuisines[cuisine])
    for name in names { #expect(glyph(name) == expected) }
  }
  for pin in fixture.pins {
    #expect(glyph(pin.name, category: pin.category, cuisine: pin.cuisine, kinds: pin.kinds ?? []) == pin.emoji)
  }
}

@Test func mapSearchOrderingMatchesExpo() throws {
  let fixture = try MapParity.load()
  let places = fixture.places.map { place in
    let source: MapPlace.Source = place.source == .own ? .saved(itemID: place.name) :
      .discover(placeID: place.name, features: place.features ?? [])
    return MapPlace(source: source, name: place.name, lat: 0, lng: 0, appleId: nil, city: place.city,
      category: nil, cuisine: nil, kinds: [])
  }
  for row in fixture.search {
    #expect(MapPlace.search(places, query: row.query).map(\.name) == row.names, "Query: \(row.query)")
  }
}

@Test func nearbyMapBoundsMatchExpo() throws {
  for row in try MapParity.load().reach {
    #expect(row.box.includingNearby(latitude: row.latitude, longitude: row.longitude) == row.expected)
  }
}

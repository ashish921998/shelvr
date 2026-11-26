import Foundation
import Testing
@testable import ShelvrKit

@Test func mapPlaceRulesMatchExpo() throws {
  struct Golden: Decodable {
    let saved: [MapPlace.SavedRow]
    let discover: [MapPlace.DiscoverRow]
    let visits: [MapVisit]
    let beside, went: [String]
    let emoji: [String?]
  }
  let file = try #require(Bundle.module.url(forResource: "map-places", withExtension: "json"))
  let golden = try JSONDecoder().decode(Golden.self, from: Data(contentsOf: file))
  let saved = golden.saved.map(\.place)
  let scene = MapScene(saved: saved, discover: golden.discover.map(\.place), visits: golden.visits, filters: .init())
  let discoverIDs = scene.visible.compactMap { place -> String? in
    guard case let .discover(placeID, _) = place.source else { return nil }
    return placeID
  }
  #expect(discoverIDs == golden.beside)
  #expect(saved.map(\.emoji) == golden.emoji)
  #expect(zip(golden.saved, saved).filter { scene.visited.contains($0.1.id) }.map { $0.0.itemId } == golden.went)
}

@Test func mapShowsSixCategoriesInStableOrderWhenTheyHaveMatches() {
  let places = PlaceKind.allCases.reversed().map { kind in
    MapPlace(source: .saved(itemID: kind.rawValue), name: kind.rawValue, lat: 0, lng: 0,
      appleId: nil, city: nil, category: nil, cuisine: nil, kinds: [kind])
  }
  let scene = MapScene(saved: places, discover: [], visits: [], filters: .init())
  #expect(scene.chips == [.food, .coffee, .activities, .drinks, .dessert, .shopping])
  let searched = MapScene(saved: places, discover: [], visits: [], filters: .init(search: "shopping"))
  #expect(searched.chips == [.shopping])

  let sparse = places.filter { $0.kinds == [.shopping] }
  let selected = MapScene(saved: sparse, discover: [], visits: [], filters: .init(kinds: [.dessert]))
  #expect(selected.chips == [.dessert, .shopping])
  #expect(selected.visible.isEmpty)
}

@Test func nameMatchesAppearAheadOfCityMatchesBeforeTruncation() throws {
  let rows = (1...6).map { i in
    ["itemId": String(i), "name": i == 6 ? "Café Berlin" : "Spot", "city": "Cafe town",
      "lat": 0.0, "lng": 0.0, "kinds": []] as [String: Any]
  }
  let places = try JSONDecoder().decode([MapPlace.SavedRow].self, from: JSONSerialization.data(withJSONObject: rows)).map(\.place)
  let scene = MapScene(saved: places, discover: [], visits: [], filters: .init(search: "cafe"))
  #expect(scene.visible.prefix(5).map(\.source) == ["6", "1", "2", "3", "4"].map { .saved(itemID: $0) })
}

@Test func separateAppleVenuesAtTheSameCoordinatesHaveIndependentVisitState() throws {
  let rows = """
    [{"itemId":"same","appleId":"A","name":"Market","lat":1,"lng":2,"kinds":[]},
    {"itemId":"same","appleId":"B","name":"Market","lat":1,"lng":2,"kinds":[]}]
    """
  let marks = """
    [{"key":"market","spots":[{"appleId":"A","lat":1,"lng":2}]}]
    """
  let places = try JSONDecoder().decode([MapPlace.SavedRow].self, from: Data(rows.utf8)).map(\.place)
  let visits = try JSONDecoder().decode([MapVisit].self, from: Data(marks.utf8))
  #expect(places[0].id != places[1].id)
  #expect(MapVisit.visitedIDs(visits, among: places) == [places[0].id])
}

@Test func modifierLetterApostrophesRemainInLegacyVisitKeys() throws {
  #expect(MapPlace.key("Kaʼa Café") == "kaʼacafe")
  #expect(MapPlace.key("L’Atelier") == "latelier")
  #expect(MapPlace.key("a\u{200C}b") == "ab")
  #expect(MapPlace.words("Kaʼa Café") == ["kaa", "cafe"])
}

@Test func openingWithAnActiveSearchFitsTheMatchingCityWhenSavedDataArrives() throws {
  let data = """
    [{"itemId":"one","name":"A","city":"Paris","lat":48,"lng":2,"kinds":[]},
    {"itemId":"two","name":"B","city":"Paris","lat":48,"lng":2,"kinds":[]},
    {"itemId":"three","name":"C","city":"Tokyo","lat":35,"lng":139,"kinds":[]}]
    """
  let saved = try JSONDecoder().decode([MapPlace.SavedRow].self, from: Data(data.utf8)).map(\.place)
  let search = MapFilters(search: "Tokyo")
  #expect(MapScene(saved: nil, discover: [], visits: [], filters: search).opening == nil)
  #expect(MapScene(saved: saved, discover: [], visits: [], filters: search).opening?.map(\.city) == ["Tokyo"])
  #expect(MapScene(saved: saved, discover: [], visits: [], filters: .init(search: "Nowhere")).opening == nil)
  #expect(MapScene(saved: saved, discover: [], visits: [], filters: .init()).opening?.map(\.city) == ["Paris", "Paris"])
}

@Test func visitFiltersHideDiscoverAndFallBackToAllWhenNoSavedPlaceIsVisited() throws {
  let savedRows = """
    [{"itemId":"one","name":"Market","lat":1,"lng":2,"kinds":["food"]},
     {"itemId":"two","name":"Bakery","lat":5,"lng":6,"kinds":["dessert"]}]
    """
  let discoverRows = """
    [{"_id":"three","appleId":"apple-three","name":"Cafe","city":"Paris","lat":3,"lng":4,"kinds":["coffee"]}]
    """
  let saved = try JSONDecoder().decode([MapPlace.SavedRow].self, from: Data(savedRows.utf8)).map(\.place)
  let discover = try JSONDecoder().decode([MapPlace.DiscoverRow].self, from: Data(discoverRows.utf8)).map(\.place)
  let visits = try JSONDecoder().decode([MapVisit].self, from: Data(#"[{"key":"market"}]"#.utf8))

  let went = MapScene(saved: saved, discover: discover, visits: visits, filters: .init(went: .went))
  #expect(went.showsWentSwitch && went.filters.went == .went)
  #expect(went.visible == [saved[0]] && went.opening == [saved[0]])
  #expect(went.chips == [.food])

  let want = MapScene(saved: saved, discover: discover, visits: visits, filters: .init(went: .want))
  #expect(want.visible == [saved[1]])

  let collapsed = MapScene(saved: saved, discover: discover, visits: [], filters: .init(went: .went))
  #expect(!collapsed.showsWentSwitch && collapsed.filters.went == .all)
  #expect(collapsed.visible == saved + discover)
}

@Test func typedMapRowsSkipUnknownKindsAndRequireSourceFields() throws {
  let known = Data(#"{"itemId":"save","name":"Cafe","lat":1,"lng":2,"kinds":["coffee","future-kind"]}"#.utf8)
  let saved = try JSONDecoder().decode(MapPlace.SavedRow.self, from: known).place
  #expect(saved.source == .saved(itemID: "save"))
  #expect(saved.kinds == [.coffee])

  let incomplete = Data(#"{"_id":"place","name":"Cafe","lat":1,"lng":2,"kinds":["coffee"]}"#.utf8)
  #expect(throws: DecodingError.self) {
    try JSONDecoder().decode(MapPlace.DiscoverRow.self, from: incomplete)
  }
  #expect(throws: DecodingError.self) {
    try JSONDecoder().decode(MapVisit.self, from: Data("{}".utf8))
  }
}

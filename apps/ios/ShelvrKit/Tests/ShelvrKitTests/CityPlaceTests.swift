import Foundation
import Testing
@testable import ShelvrKit

@Test func cityGroupsNearbyRepeatedNamesAndAppleAliasesButKeepsDistinctVenues() throws {
  let data = Data("""
    [{"_id":"save","_creationTime":0,"status":"ready","placePins":[
      {"name":"Café","lat":1,"lng":1},{"name":"Cafe","lat":1,"lng":1.001,"appleId":"a"},
      {"name":"Side door","lat":1,"lng":1,"appleId":"a"},{"name":"Side Door","lat":1,"lng":1},
      {"name":"Cafe","lat":1,"lng":1.001,"appleId":"b"},{"name":"Cafe","lat":2,"lng":2}
    ]}]
    """.utf8)
  let pins = CityPlace.pins(in: try JSONDecoder().decode([LibrarySave].self, from: data))
  #expect(pins.map(\.name) == ["Café", "Cafe", "Cafe"])
  #expect(pins.map(\.appleID) == ["a", "b", nil])
}

@Test func secondarySourceSaveIsReachableAfterVenueMerging() throws {
  let data = Data("""
    [{"_id":"a","_creationTime":0,"status":"ready","placePins":[{"name":"Cafe","lat":1,"lng":1}]},
     {"_id":"b","_creationTime":0,"status":"ready","placePins":[{"name":"Cafe","lat":1,"lng":1}]}]
    """.utf8)
  let saves = try JSONDecoder().decode([LibrarySave].self, from: data)
  let pins = CityPlace.pins(in: saves)
  #expect(pins.map(\.itemID) == ["a"])
  #expect(CityPlace.remainingSaves(saves, pins: pins).map(\.id) == ["b"])
}
@Test func swappingStopsKeepsASavedAnchorAndCyclesNearestValidVenues() throws {
  let data = Data("""
    {"city":"City","status":"ready","kind":"classic","evenings":[{"first":0,"second":1}],"stops":[
      {"name":"First","lat":0,"lng":0,"slot":"first","source":"save"},
      {"name":"Second","lat":0,"lng":0.001,"slot":"second","source":"suggested"},
      {"name":"Nearest","lat":0,"lng":0.002,"slot":"first","source":"save"},
      {"name":"Further","lat":0,"lng":0.004,"slot":"first","source":"save"},
      {"name":"Two suggestions","lat":0,"lng":0.001,"slot":"first","source":"suggested"},
      {"name":"Too far","lat":0,"lng":1,"slot":"first","source":"save"}]}
    """.utf8)
  let date = try JSONDecoder().decode(CityDate.self, from: data)
  let start = try #require(date.evenings.first)
  #expect(date.swap(start, first: true, tried: [])?.first == 2)
  #expect(date.swap(start, first: true, tried: [2])?.first == 3)
  #expect(date.swap(start, first: true, tried: [2, 3])?.first == 2)
  #expect(date.nextRound([0, 2], from: 3, to: 2).isEmpty)
  #expect(date.nextRound([0], from: 2, to: 3) == [0, 2])
  #expect(date.swap(start, first: false, tried: []) == nil)
}

@Test func voteReuseRequiresTheSameUniquePlacesAndAnUnexpiredLink() throws {
  let data = Data("""
    {"token":"sample","voters":1,"expiresAt":1000,"places":[
      {"key":"p0","name":"Café","itemId":"a","picks":1,"passes":0}]}
    """.utf8)
  let votes = try JSONDecoder().decode(CityVotes.self, from: data)
  let exact = CityPlace(itemID: "a", name: "Cafe", lat: 0, lng: 0)
  let replacement = CityPlace(itemID: "b", name: "Cafe", lat: 0, lng: 0)
  #expect(votes.sameSelection([exact, exact], among: [exact]))
  #expect(votes.sameSelection([replacement], among: [replacement]))
  #expect(!votes.sameSelection([replacement], among: [exact, replacement]))
  #expect(votes.isOpen(at: Date(timeIntervalSince1970: 0.9)))
  #expect(!votes.isOpen(at: Date(timeIntervalSince1970: 1)))
}

@Test func swiftUsesTheCityVoteAndDateResultsGeneratedByExpo() throws {
  struct Vectors: Decodable {
    struct Expected: Decodable {
      let keys: [String]
      let same: [Bool]
      let swaps: [Int?]
    }
    let pins: [CityPlace]
    let link: CityVotes
    let cases: [[Int]]
    let date: CityDate
    let rounds: [[Int]]
    let expected: Expected
  }
  let url = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../TestData/city-rules.json")
  let vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
  #expect(vectors.pins.map { CityPlace.key($0.name) } == vectors.expected.keys)
  #expect(vectors.cases.map { indices in
    vectors.link.sameSelection(indices.map { vectors.pins[$0] }, among: vectors.pins)
  } == vectors.expected.same)
  let evening = try #require(vectors.date.evenings.first)
  #expect(vectors.rounds.map { vectors.date.swap(evening, first: true, tried: Set($0))?.first } == vectors.expected.swaps)
}

@Test func rollAvoidsThePriorChoiceAndUsesTheCityAndCategory() throws {
  let data = Data("""
    [{"name":"Coffee","city":" CITY ","lat":0,"lng":0,"kinds":["coffee"]},
     {"name":"Store","city":"City","lat":1,"lng":1,"category":"Store"},
     {"name":"Away","city":"Other","lat":1,"lng":1,"kinds":["food"]}]
    """.utf8)
  let places = GoOutPlace.distinct(try JSONDecoder().decode([GoOutPlace].self, from: data), city: "City")
  #expect(places.map(\.name) == ["Coffee", "Store"])
  #expect(places.filter { $0.matches("food") }.map(\.name) == ["Coffee"])
  #expect(GoOutPlace.rolled(places, previous: places[0]) == places[1])
}

@Test func legacyPinsUseCityScopedLibraryMembershipForQuickPicks() throws {
  let decoder = JSONDecoder()
  let mapped = try decoder.decode([GoOutPlace].self, from: Data("""
    [{"name":"Legacy cafe","lat":1,"lng":2},{"name":"Other location","lat":3,"lng":4}]
    """.utf8))
  let cityRows = try decoder.decode([LibrarySave].self, from: Data("""
    [{"_id":"fixture","_creationTime":0,"status":"ready","cities":["Austin"],
      "placePins":[{"name":"Legacy cafe","lat":1,"lng":2}]}]
    """.utf8))
  #expect(GoOutPlace.distinct(mapped, city: "Austin", citySaves: cityRows).map(\.name) == ["Legacy cafe"])
  #expect(GoOutPlace.distinct(mapped, city: "Houston").isEmpty)
}

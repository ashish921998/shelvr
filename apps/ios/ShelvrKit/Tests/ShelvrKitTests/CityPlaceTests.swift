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

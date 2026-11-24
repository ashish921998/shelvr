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

import Foundation
import Testing
@testable import ShelvrKit

@Test func spotRevealKeepsOnlyVenuesInTheWinningCity() throws {
  let data = Data("""
    {"_id":"a","_creationTime":1,"status":"ready","cities":["A","B"],"placePins":[
      {"name":"12 Main Street","city":"A","lat":0,"lng":1},{"name":"First","city":"B","lat":1,"lng":1},
      {"name":"Second","city":"B","lat":1,"lng":2},{"name":"Legacy","lat":2,"lng":1}]}
    """.utf8)
  let save = try JSONDecoder().decode(LibrarySave.self, from: data)
  let reveal = SaveSpotReveal.result(save: save, loaded: true, waited: 20, readyFor: 0)
  guard case let .spots(city, pins) = reveal else { Issue.record("Missing spots"); return }
  #expect(city == "B")
  #expect(pins.map(\.name) == ["First", "Second"])
  #expect(SaveSpotReveal.result(save: nil, loaded: false, waited: 24, readyFor: 0) == .finding)
  #expect(SaveSpotReveal.result(save: nil, loaded: false, waited: 25, readyFor: 0) == .map)
}

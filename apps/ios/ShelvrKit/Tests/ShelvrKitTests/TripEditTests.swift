import Foundation
import Testing
@testable import ShelvrKit

@Test func tripDayLinksAndOptionalStopTimesMatchTheContract() {
  #expect(TripEdit.day(0, count: 3) == 0)
  #expect(TripEdit.day(2, count: 3) == 2)
  #expect(TripEdit.day(18, count: 3) == 1)
  for value in ["", "00:00", "23:59"] { #expect(TripEdit.validTime(value)) }
  for value in ["24:00", "1:00", "12:60"] { #expect(!TripEdit.validTime(value)) }
}

@Test func searchLabelsUseTheSameVenueRulesAsTheTrip() throws {
  let trip = try JSONDecoder().decode(CityTrip.self, from: Data("""
    {"city":"Lisbon","days":[[{"_id":"stop","name":"Santa Joana","lat":0,"lng":0,"appleId":"one"}]],"unplanned":[]}
    """.utf8))
  func candidate(_ name: String, _ id: String?, _ lng: Double) -> TripSearchPlace {
    TripSearchPlace(name: name, lat: 0, lng: lng, appleId: id, category: nil, area: nil)
  }
  #expect(TripEdit.alreadyOnTrip(candidate("Alias", "one", 3), trip: trip))
  #expect(!TripEdit.alreadyOnTrip(candidate("Santa Joana", "two", 0), trip: trip))
  #expect(TripEdit.alreadyOnTrip(candidate("Locke de Santa Joana", nil, 0.001), trip: trip))
  #expect(!TripEdit.alreadyOnTrip(candidate("Santa Joana", nil, 1), trip: trip))
}

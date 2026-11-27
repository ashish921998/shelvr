import Foundation
import Testing
@testable import ShelvrKit

@Test func placeHoursFollowTheVenueDate() throws {
  let data = Data(#"{"localDate":"2026-11-26","timeZone":"America/Los_Angeles","intervals":[]}"#.utf8)
  let hours = try JSONDecoder().decode(PlaceDayHours.self, from: data)
  let lateThursday = try Date("2026-11-27T06:55:00Z", strategy: .iso8601)
  let earlyFriday = try Date("2026-11-27T08:05:00Z", strategy: .iso8601)
  #expect(hours.display(on: lateThursday, locale: Locale(identifier: "en_US")) == .closed)
  #expect(hours.display(on: earlyFriday, locale: Locale(identifier: "en_US")) == nil)
}

@Test func placeHoursShowSplitAndOvernightRangesInClockOrder() throws {
  let data = Data(#"{"localDate":"2026-11-27","timeZone":"America/Los_Angeles","intervals":[{"opensMinute":1080,"closesMinute":1560},{"opensMinute":660,"closesMinute":840}]}"#.utf8)
  let hours = try JSONDecoder().decode(PlaceDayHours.self, from: data)
  let date = try Date("2026-11-27T18:00:00Z", strategy: .iso8601)
  #expect(hours.display(on: date, locale: Locale(identifier: "fr_FR")) == .ranges("11:00–14:00 · 18:00–2:00"))
}

@Test func placeHoursDistinguishAnAllDayScheduleFromInvalidData() throws {
  let date = try Date("2026-11-27T18:00:00Z", strategy: .iso8601)
  let locale = Locale(identifier: "en_US")
  let allDay = Data(#"{"localDate":"2026-11-27","timeZone":"America/Los_Angeles","intervals":[{"opensMinute":0,"closesMinute":1440}]}"#.utf8)
  let invalid = Data(#"{"localDate":"2026-11-27","timeZone":"America/Los_Angeles","intervals":[{"opensMinute":600,"closesMinute":599}]}"#.utf8)
  #expect(try JSONDecoder().decode(PlaceDayHours.self, from: allDay).display(on: date, locale: locale) == .allDay)
  #expect(try JSONDecoder().decode(PlaceDayHours.self, from: invalid).display(on: date, locale: locale) == nil)
}

@Test func mapRowsAcceptOptionalVerifiedHours() throws {
  let data = Data("""
    [
      {"itemId":"malformed","name":"Deli","lat":37.79,"lng":-122.39,"kinds":[],
       "todayHours":{"localDate":"2026-11-26","timeZone":"America/Los_Angeles"}},
      {"itemId":"known","name":"Oyster Bar","lat":37.79,"lng":-122.39,"kinds":["food"],
       "todayHours":{"localDate":"2026-11-26","timeZone":"America/Los_Angeles","intervals":[]}},
      {"itemId":"old","name":"Cafe","lat":37.79,"lng":-122.39,"kinds":["coffee"]}
    ]
    """.utf8)
  let rows = try JSONDecoder().decode([MapPlace.SavedRow].self, from: data)
  #expect(rows.map { $0.place.name } == ["Deli", "Oyster Bar", "Cafe"])
  #expect(rows.map { $0.place.todayHours != nil } == [false, true, false])
}

@Test func invalidDiscoverHoursDoNotHideAnyVenues() throws {
  let data = Data("""
    [
      {"_id":"malformed","name":"Deli","appleId":"first","city":"City","lat":37.79,"lng":-122.39,"kinds":[],
       "todayHours":{"localDate":"2026-11-26","timeZone":"America/Los_Angeles","intervals":[{"opensMinute":"600","closesMinute":720}]}},
      {"_id":"known","name":"Cafe","appleId":"second","city":"City","lat":37.79,"lng":-122.39,"kinds":[],
       "todayHours":{"localDate":"2026-11-26","timeZone":"America/Los_Angeles","intervals":[]}}
    ]
    """.utf8)
  let rows = try JSONDecoder().decode([MapPlace.DiscoverRow].self, from: data)
  #expect(rows.map { $0.place.name } == ["Deli", "Cafe"])
  #expect(rows.map { $0.place.todayHours != nil } == [false, true])
}

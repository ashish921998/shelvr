import Foundation
import Testing
@testable import ShelvrKit

@Test func countryChoicesMatchTheBackendAndDatesAreInclusiveAcrossClockChanges() throws {
  let url = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../../native/convex/model/tripCountries.json")
  let supported = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
  #expect(Set(BlankTrip.countryCodes) == Set(supported.keys))
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = try #require(TimeZone(identifier: "America/New_York"))
  let start = try #require(calendar.date(from: .init(year: 2026, month: 10, day: 31)))
  let end = try #require(calendar.date(from: .init(year: 2026, month: 11, day: 2)))
  #expect(BlankTrip.dayCount(start: start, end: end, calendar: calendar) == 3)
}

@Test func limitingTripNamesPreservesWholeCharacters() {
  let prefix = String(repeating: "a", count: 79)
  #expect(BlankTrip.limitedName(prefix + "😀") == prefix)
  #expect(BlankTrip.limitedName(String(repeating: "a", count: 78) + "😀").utf16.count == 80)
}

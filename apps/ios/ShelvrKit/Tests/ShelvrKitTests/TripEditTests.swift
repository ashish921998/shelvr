import Testing
@testable import ShelvrKit

@Test func tripDayLinksAndOptionalStopTimesMatchTheContract() {
  #expect(TripEdit.day(0, count: 3) == 0)
  #expect(TripEdit.day(2, count: 3) == 2)
  #expect(TripEdit.day(18, count: 3) == 1)
  for value in ["", "00:00", "23:59"] { #expect(TripEdit.validTime(value)) }
  for value in ["24:00", "1:00", "12:60"] { #expect(!TripEdit.validTime(value)) }
}

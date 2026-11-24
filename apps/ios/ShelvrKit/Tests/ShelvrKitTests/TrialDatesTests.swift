import Foundation
import Testing
@testable import ShelvrKit

@Test func trialDatesClampMonthEndsAndAvoidNighttimeReminders() throws {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = try #require(TimeZone(secondsFromGMT: 0))
  let start = try #require(calendar.date(from: DateComponents(year: 2024, month: 1, day: 31, hour: 6)))
  let trial = try #require(TrialDates(start: start, unit: .month, count: 1, calendar: calendar))
  #expect(calendar.component(.day, from: trial.end) == 29)
  let reminder = try #require(trial.reminder)
  #expect(calendar.component(.day, from: reminder) == 26)
  #expect(calendar.component(.hour, from: reminder) == 20)
  #expect(TrialDates.reminder(before: trial.end, now: reminder, calendar: calendar) == nil)
}

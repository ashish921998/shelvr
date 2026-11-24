import Foundation
import Testing
@testable import ShelvrKit

@Test func reminderPreferencesAffectEngagementButKeepBillingWarnings() throws {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
  let end = try #require(cal.date(from: DateComponents(year: 2026, month: 11, day: 3, hour: 18)))
  let now = end.addingTimeInterval(-8 * 86_400)
  let billing = TrialNotification.schedule(expiration: end, now: now, nudges: false, calendar: cal)
  #expect(billing.map(\.kind) == [.ending, .lastDay])
  #expect(billing[0].date <= end.addingTimeInterval(-2 * 86_400))
  let all = TrialNotification.schedule(expiration: end, now: now, nudges: true, calendar: cal)
  #expect(all.map(\.kind) == [.ending, .lastDay, .dayOne, .dayThree])
  #expect(TrialNotification.schedule(expiration: end, now: end, nudges: true, calendar: cal).isEmpty)
}

@Test func overnightLastDayWarningNeverMovesPastTheRenewalCutoff() throws {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = try #require(TimeZone(identifier: "UTC"))
  let end = try #require(cal.date(from: DateComponents(year: 2026, month: 6, day: 4, hour: 7)))
  let result = TrialNotification.schedule(expiration: end, now: end.addingTimeInterval(-8 * 86_400), nudges: true, calendar: cal)
  #expect(!result.map(\.kind).contains(.lastDay))
  #expect(result.filter { $0.kind == .dayOne || $0.kind == .dayThree }.allSatisfy { cal.component(.hour, from: $0.date) == 10 })
}


@Test func theFirstLoadedTrialCanOfferTheLibraryPermissionPrimer() {
  #expect(TrialNotification.shouldArmPrimer(
    previousAccount: nil, previousStatus: nil, account: "fixture", status: "trialing"))
  #expect(TrialNotification.shouldArmPrimer(
    previousAccount: "fixture", previousStatus: nil, account: "fixture", status: "trialing"))
  #expect(TrialNotification.shouldArmPrimer(
    previousAccount: "fixture", previousStatus: "none", account: "fixture", status: "trialing"))
  #expect(!TrialNotification.shouldArmPrimer(
    previousAccount: "fixture", previousStatus: "trialing", account: "fixture", status: "trialing"))
  #expect(!TrialNotification.shouldArmPrimer(
    previousAccount: nil, previousStatus: nil, account: "fixture", status: nil))
}

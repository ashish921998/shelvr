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


@Test func trialObservationRestartsWhenAFailedSignOutRestoresTheSameAccount() {
  let generation = UUID()
  let original = TrialNotification.ObserverSession(generation: generation, account: "fixture")
  let unavailable = TrialNotification.ObserverSession(generation: generation, account: nil)
  let restored = TrialNotification.ObserverSession(generation: generation, account: "fixture")
  #expect(original != unavailable && unavailable != restored && original == restored)
  #expect(original.canContinue(generation: generation, account: nil))
  #expect(original.canContinue(generation: generation, account: "fixture"))
  #expect(!unavailable.canContinue(generation: generation, account: "fixture"))
  #expect(!original.canContinue(generation: generation, account: "another"))
  #expect(!original.canContinue(generation: UUID(), account: "fixture"))
}


@Test func trialWarningsDoNotWaitForTheNudgePreference() throws {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = try #require(TimeZone(secondsFromGMT: 0))
  let format = ISO8601DateFormatter()
  let now = try #require(format.date(from: "2026-09-10T17:00:00Z"))
  let expiration = try #require(format.date(from: "2026-09-17T17:00:00Z"))
  let warnings = TrialNotification.schedule(expiration: expiration, now: now, nudges: nil, calendar: calendar)
  #expect(warnings.map(\.kind) == [.ending, .lastDay])
  #expect(warnings == TrialNotification.schedule(expiration: expiration, now: now, nudges: false, calendar: calendar))
}

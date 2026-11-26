import Foundation
import Testing
@testable import ShelvrKit

@Suite struct PaywallAttemptTests {
  let start = Date(timeIntervalSince1970: 1_000)

  @Test func foldsTrialEligibilityLikeExpo() {
    typealias T = PaywallAttempt.TrialEligibility
    #expect(T.folding([]) == .unknown)
    #expect(T.folding([.ineligible, .eligible]) == .eligible)
    #expect(T.folding([.noIntro, .noIntro]) == .noIntro)
    #expect(T.folding([.noIntro, .ineligible]) == .ineligible)
    #expect(T.folding([.noIntro, nil]) == .unknown)
    #expect(T.noIntro.rawValue == "no_intro")
  }

  @Test func requestCarriesOnlyPlacementAndIDAndFailureTimesFromRequest() throws {
    var attempt = PaywallAttempt(placement: "make_plan", now: start)
    #expect(attempt.requested.keys.sorted() == ["paywall_attempt_id", "placement"])
    #expect(attempt.id == attempt.id.lowercased())
    let failure = attempt.failed("identity_not_ready", now: start.addingTimeInterval(1.2345))
    let failed = try #require(failure)
    #expect(failed["reason"] as? String == "identity_not_ready")
    #expect(failed["duration_ms"] as? Int == 1235)
    let again = attempt.failed("again")
    let late = attempt.present(offeringID: "default", trialEligible: .eligible)
    #expect(again == nil && late == nil)
  }

  @Test func outcomesSettleOnceAndTimeFromPresentation() throws {
    var attempt = PaywallAttempt(placement: "add", now: start)
    let early = attempt.finish(.cancelled)
    #expect(early.isEmpty)
    let presented = attempt.present(offeringID: "default", trialEligible: .noIntro, now: start.addingTimeInterval(2))
    let started = try #require(presented)
    #expect(started["offering_id"] as? String == "default")
    #expect(started["trial_eligible"] as? String == "no_intro")
    #expect(started["duration_ms"] == nil)
    let events = attempt.finish(.purchased, productID: "annual", now: start.addingTimeInterval(5))
    #expect(events.map(\.0) == ["paywall_shown", "paywall_purchase_completed"])
    #expect(events[0].1["product_id"] == nil)
    #expect(events[1].1["product_id"] as? String == "annual")
    #expect(events[1].1["duration_ms"] as? Int == 3000)
    let twice = attempt.finish(.cancelled)
    let failedLate = attempt.failed("late")
    #expect(twice.isEmpty && failedLate == nil)
  }

  @Test func presentationOmitsMissingContext() throws {
    var attempt = PaywallAttempt(placement: "retry", now: start)
    let presented = attempt.present(offeringID: nil, trialEligible: nil, now: start)
    let started = try #require(presented)
    #expect(started.keys.sorted() == ["paywall_attempt_id", "placement"])
    let cancelled = attempt.finish(.cancelled, productID: "annual", now: start)
    #expect(cancelled[1].0 == "paywall_cancelled")
    #expect(cancelled[1].1["product_id"] == nil)
  }

  @MainActor @Test func entitlementActivatesOnFirstActiveStatusAfterAccess() throws {
    let funnel = PaywallFunnel()
    #expect(funnel.observe(account: "a", status: "none", now: start) == nil)
    #expect(funnel.recordAccess(.purchase, now: start) == nil)
    #expect(funnel.observe(account: "a", status: "lapsed", now: start) == nil)
    let event = try #require(funnel.observe(account: "a", status: "trialing", now: start.addingTimeInterval(4)))
    #expect(event["status"] as? String == "trialing")
    #expect(event["source"] as? String == "purchase")
    #expect(event["delay_ms"] as? Int == 4000)
    #expect(funnel.observe(account: "a", status: "trialing") == nil)
    #expect(funnel.recordAccess(.restore, unlessActive: true) == nil)
    let immediate = try #require(funnel.recordAccess(.restore))
    #expect(immediate["status"] as? String == "trialing")
    #expect(immediate["delay_ms"] as? Int == 0)
  }

  @MainActor @Test func accessBeforeTheFirstPlanReadStillActivates() {
    let funnel = PaywallFunnel()
    _ = funnel.recordAccess(.purchase, now: start)
    #expect(funnel.observe(account: "a", status: "trialing", now: start)?["source"] as? String == "purchase")
  }

  @MainActor @Test func accountChangeDropsPendingAccess() {
    let funnel = PaywallFunnel()
    _ = funnel.observe(account: "a", status: nil, now: start)
    _ = funnel.recordAccess(.purchase, now: start)
    #expect(funnel.observe(account: "b", status: "pro", now: start) == nil)
  }

  @MainActor @Test func blockedActionResumesWithinThirtyMinutesForTheSamePlacement() throws {
    let funnel = PaywallFunnel()
    funnel.block("make_plan", now: start)
    #expect(funnel.resume("plan_trip", now: start) == nil)
    _ = funnel.recordAccess(.purchase, now: start)
    let event = try #require(funnel.resume("make_plan", now: start.addingTimeInterval(60)))
    #expect(event["delay_ms"] as? Int == 60_000)
    #expect(event["purchased_since_block"] as? Bool == true)
    #expect(funnel.resume("make_plan", now: start) == nil)
    funnel.block("passport", now: start)
    #expect(funnel.resume("passport", now: start.addingTimeInterval(30 * 60 + 1)) == nil)
    funnel.block("passport", now: start)
    let unpaid = try #require(funnel.resume("passport", now: start))
    #expect(unpaid["purchased_since_block"] as? Bool == false)
  }
}

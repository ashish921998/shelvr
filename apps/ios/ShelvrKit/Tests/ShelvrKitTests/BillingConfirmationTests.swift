import Foundation
import Testing
@testable import ShelvrKit

@MainActor @Test func latePurchaseResponsesCannotResumeASignedOutOrDifferentAccount() async {
  let initial = BillingAccount(session: UUID(), userID: "a")
  let replacements: [BillingAccount?] = [nil, BillingAccount(session: UUID(), userID: "a"),
    BillingAccount(session: initial.session, userID: "b")]
  for replacement in replacements {
    let confirmation = BillingConfirmation()
    var current: BillingAccount? = initial
    var resumed = 0
    await confirmation.sync(for: initial, current: { current }, synchronize: {
      await Task.yield()
      current = replacement
      return true
    }, confirmed: { resumed += 1 })?.value
    #expect(resumed == 0 && confirmation.state == .idle)
  }
}

@MainActor @Test func purchaseAndRestoreCallbacksConfirmAtMostOnceInTheSameSession() async {
  let account = BillingAccount(session: UUID(), userID: "member")
  let gate = BillingConfirmation()
  var requests = 0
  var resumed = 0
  await gate.sync(for: account, current: { account }, synchronize: {
    requests += 1
    await gate.sync(for: account, current: { account }, synchronize: { requests += 1; return true },
      confirmed: { resumed += 1 })?.value
    return true
  }, confirmed: { resumed += 1 })?.value
  await gate.sync(for: account, current: { account }, synchronize: { requests += 1; return true },
    confirmed: { resumed += 1 })?.value
  #expect(requests == 1 && resumed == 1 && gate.state == .confirmed)
}

@MainActor @Test func inactiveServerEntitlementAllowsRetryWithoutPrematureConfirmation() async {
  let account = BillingAccount(session: UUID(), userID: "member")
  let gate = BillingConfirmation()
  var resumed = 0
  await gate.sync(for: account, current: { account }, synchronize: { false }, confirmed: { resumed += 1 })?.value
  #expect(gate.state == .failed && resumed == 0)
  await gate.sync(for: account, current: { account }, synchronize: { true }, confirmed: { resumed += 1 })?.value
  #expect(gate.state == .confirmed && resumed == 1)
}

@MainActor @Test func startingConfirmationLocksTheSheetBeforeTheServerTaskRuns() async {
  let account = BillingAccount(session: UUID(), userID: "member")
  let gate = BillingConfirmation()
  var current: BillingAccount? = account
  var calls = 0
  let task = gate.sync(for: account, current: { current }, synchronize: { calls += 1; return true },
    confirmed: { Issue.record("A signed-out account cannot complete a purchase handoff") })
  #expect(gate.state == .syncing)
  current = nil
  await task?.value
  #expect(calls == 0 && gate.state == .idle)
}

@Test func eligibleYearlyProductsAreReadEvenWhenThereIsNoSeparateAlternateOffering() async {
  let ids = ["weekly", "annual"]
  var lookups: [[String]] = []
  let result = await PaywallEligibility.check(products: ids, hasAlternate: false) { products in
    lookups.append(products)
    return ["annual": .eligible, "weekly": .unknown]
  }
  #expect(lookups == [ids])
  #expect(result.eligible == ["annual"] && !result.useAlternate)
  let fallback = await PaywallEligibility.check(products: ids, hasAlternate: true) { _ in ["annual": .ineligible] }
  #expect(fallback.useAlternate)
  let uncertain = await PaywallEligibility.check(products: ids, hasAlternate: true) { _ in ["annual": .unknown] }
  #expect(!uncertain.useAlternate)
}

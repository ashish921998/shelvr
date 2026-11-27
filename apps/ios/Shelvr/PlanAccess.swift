import ShelvrKit
import SwiftUI

@MainActor @Observable
final class PlanAccess {
  struct Allowance: Decodable { let open: Bool; let limit, left: Int }
  private(set) var plan: ServerPlan?
  private(set) var allowance: Allowance?
  private(set) var receivedAllowance = false
  private(set) var failed = false
  var retry = 0
  private var account: String?

  private(set) var pro = false
  var loading: Bool { failed || plan == nil || (!pro && !receivedAllowance) }
  var locked: Bool { !loading && !pro && allowance == nil }
  var restrictsPersonalAccess: Bool { loading || locked }

  func readPlan(_ backend: Backend) async {
    plan = nil; pro = false; receivedAllowance = false; failed = false
    account = backend.userID
    do {
      for try await row in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
        try Task.checkCancellation()
        plan = row
        pro = row.entitled
        if let event = PaywallFunnel.shared.observe(account: backend.userID, status: row.entitled ? row.status : nil) {
          Analytics.capture("entitlement_activated", event)
        }
      }
    } catch { if !Task.isCancelled { failed = true } }
  }

  func expire(at milliseconds: Double) async {
    let remaining = milliseconds / 1000 - Date.now.timeIntervalSince1970
    if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
    guard !Task.isCancelled, plan?.expiresAt == milliseconds else { return }
    pro = plan?.entitled ?? false
    if let event = PaywallFunnel.shared.observe(account: account, status: pro ? plan?.status : nil) {
      Analytics.capture("entitlement_activated", event)
    }
  }

  func readAllowance(_ backend: Backend) async {
    let reading = retry
    receivedAllowance = false
    guard plan != nil, !pro else { return }
    do {
      for try await row in backend.query("freeSaves:getFreeSaves", as: Allowance?.self) {
        try Task.checkCancellation()
        guard reading == retry, plan != nil, !pro else { return }
        allowance = row; receivedAllowance = true
      }
    } catch { if !Task.isCancelled { failed = true } }
  }
}

struct PlanGateView: View {
  @Environment(\.copy) private var copy
  @Environment(PlanAccess.self) private var access
  @State private var sheet: BillingDestination?
  var body: some View {
    VStack(spacing: 16) {
      Text(copy("planGate.title")).font(.largeTitle.bold())
      Text(copy("planGate.body")).foregroundStyle(.secondary)
      Button(copy("planGate.seePlans")) { sheet = .paywall }.buttonStyle(.borderedProminent)
      Button(copy("pro.restore")) { sheet = .restore }
      if let route = AppLink("/shared-lists") { NavigationLink(copy("sharedLists.title"), value: route) }
      if let route = AppLink("/shared-trip-links") { NavigationLink(copy("tripShare.manage"), value: route) }
      if let route = AppLink("/profile") { NavigationLink(copy("navigation.profile"), value: route) }
    }
    .padding(24)
    .sheet(item: $sheet) { BillingSheet(destination: $0, placement: "plan_gate", confirmed: { access.retry += 1 }) }
  }
}

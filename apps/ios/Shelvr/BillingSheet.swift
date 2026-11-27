import RevenueCat
import RevenueCatUI
import ShelvrKit
import SwiftUI

enum BillingDestination: String, Identifiable {
  case paywall, manage, restore
  var id: Self { self }
}

@MainActor
enum BillingIdentity {
  static var currentLogin: Task<Void, Error>?

  static func select(_ id: String, environment: AppEnvironment) async throws {
    let previous = currentLogin
    let login = Task {
      _ = await previous?.result
      try Task.checkCancellation()
      guard let key = Bundle.main.object(forInfoDictionaryKey: "ShelvrRevenueCatKey") as? String,
        key.hasPrefix(environment.variant == .development ? "test_" : "appl_")
      else { throw BillingFailure.unavailable }
      if !Purchases.isConfigured {
        Purchases.configure(withAPIKey: key, appUserID: id)
      } else if Purchases.shared.appUserID != id {
        _ = try await Purchases.shared.logIn(id)
      }
    }
    currentLogin = login
    try await login.value
  }
}

private enum BillingFailure: Error { case unavailable }

struct BillingSheet: View {
  let destination: BillingDestination
  var placement = "pro_gate"
  var goalVariables: [String: String] = [:]
  var availabilityChanged: (Bool) -> Void = { _ in }
  var confirmed: () -> Void = {}
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var session: UUID?
  @State private var userID: String?
  @State private var offer: PaywallOffer?
  @State private var failed = false
  @State private var attempt = 0
  @State private var noPurchase = false
  @State private var confirmation = BillingConfirmation()
  @State private var paywall: PaywallAttempt?

  var body: some View {
    Group {
      if noPurchase {
        ContentUnavailableView(copy("pro.notFoundTitle"), systemImage: "creditcard",
          description: Text(copy("pro.notFoundBody", ["store": "App Store"])))
      } else if failed || confirmation.state == .failed {
        ContentUnavailableView {
          Label(copy(destination == .restore ? "pro.restoreFailed" : "pro.loadFailed"), systemImage: "exclamationmark.circle")
        } actions: {
          Button(copy("common.retry")) {
            if confirmation.state == .failed { sync() } else { attempt += 1 }
          }
        }
      } else if confirmation.state == .syncing {
        ProgressView(copy("pro.checking"))
      } else if userID != nil, destination == .manage {
        CustomerCenterView()
          .onCustomerCenterRestoreCompleted { info in finish(info, restored: true) }
      } else if let offer, userID != nil {
        PaywallView(offering: offer.offering, displayCloseButton: true)
          .customPaywallVariables(offer.variables.merging(goalVariables.mapValues(CustomVariableValue.string)) { $1 })
          .onRequestedDismissal { if confirmation.state != .syncing { dismiss() } }
          .onPurchaseCompleted { info in finish(info, restored: false) }
          .onRestoreCompleted { info in finish(info, restored: true) }
      } else {
        ProgressView()
      }
    }
    .interactiveDismissDisabled(confirmation.state == .syncing)
    .onDisappear { capture(paywall?.finish(.cancelled) ?? []) }
    .task(id: attempt) {
      let generation = backend.sessionGeneration
      failed = false
      availabilityChanged(true)
      if destination == .paywall {
        let next = PaywallAttempt(placement: attempt == 0 ? placement : "retry")
        paywall = next
        Analytics.capture("paywall_requested", next.requested)
      }
      var reason = "identity_not_ready"
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          guard let id = user?._id else { throw BillingFailure.unavailable }
          try await BillingIdentity.select(id, environment: backend.environment)
          try Task.checkCancellation()
          if destination == .paywall {
            reason = "sdk_unavailable"
            guard let current = try await PaywallOffer.load(copy: copy) else { throw BillingFailure.unavailable }
            offer = current
          }
          try Task.checkCancellation()
          guard backend.sessionGeneration == generation else { return }
          session = generation
          userID = id
          if destination == .paywall, let offer,
            let started = paywall?.present(offeringID: offer.offering.identifier, trialEligible: offer.trialEligible) {
            Analytics.capture("paywall_presentation_started", started)
          }
          if destination == .restore {
            let info = try await Purchases.shared.restorePurchases()
            try Task.checkCancellation()
            guard backend.sessionGeneration == generation, Purchases.shared.appUserID == id else { return }
            if info.entitlements.active[proKey] == nil { noPurchase = true } else {
              if let event = PaywallFunnel.shared.recordAccess(.restore, unlessActive: true) { Analytics.capture("entitlement_activated", event) }
              sync()
            }
          }
          return
        }
      } catch {
        if !Task.isCancelled {
          failed = true
          availabilityChanged(false)
          if let event = paywall?.failed(reason) { Analytics.capture("paywall_failed", event) }
        }
      }
    }
  }

  private var proKey: String { backend.environment.variant == .production ? "Shelvr Pro" : "shelvr_pro" }

  private func finish(_ info: CustomerInfo, restored: Bool) {
    guard let entitlement = info.entitlements.active[proKey] else { return }
    if destination == .paywall {
      capture(paywall?.finish(restored ? .restored : .purchased, productID: entitlement.productIdentifier) ?? [])
      if let event = PaywallFunnel.shared.recordAccess(restored ? .restore : .purchase) { Analytics.capture("entitlement_activated", event) }
    }
    sync()
  }

  private func capture(_ events: [(String, [String: Any])]) {
    for (event, properties) in events { Analytics.capture(event, properties) }
  }

  private func sync() {
    guard let session, let userID else { return }
    let expected = BillingAccount(session: session, userID: userID)
    confirmation.sync(for: expected, current: {
      guard backend.status == .signedIn, Purchases.isConfigured else { return nil }
      return BillingAccount(session: backend.sessionGeneration, userID: Purchases.shared.appUserID)
    }, synchronize: {
      try await backend.client.action("subscriptions:syncPurchase")
    }, confirmed: {
      confirmed()
      dismiss()
    })
  }
}

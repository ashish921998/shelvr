import RevenueCat
import RevenueCatUI
import ShelvrKit
import SwiftUI

enum BillingDestination: String, Identifiable {
  case paywall, manage
  var id: Self { self }
}

@MainActor
private enum BillingIdentity {
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
  @State private var confirmation = BillingConfirmation()

  var body: some View {
    Group {
      if failed || confirmation.state == .failed {
        ContentUnavailableView {
          Label(copy("pro.loadFailed"), systemImage: "exclamationmark.circle")
        } actions: {
          Button(copy("common.retry")) {
            if confirmation.state == .failed { sync() } else { attempt += 1 }
          }
        }
      } else if confirmation.state == .syncing {
        ProgressView(copy("pro.checking"))
      } else if userID != nil, destination == .manage {
        CustomerCenterView()
          .onCustomerCenterRestoreCompleted { info in finish(info) }
      } else if let offer, userID != nil {
        PaywallView(offering: offer.offering, displayCloseButton: true)
          .customPaywallVariables(offer.variables.merging(goalVariables.mapValues(CustomVariableValue.string)) { $1 })
          .onRequestedDismissal { if confirmation.state != .syncing { dismiss() } }
          .onPurchaseCompleted { info in finish(info) }
          .onRestoreCompleted { info in finish(info) }
      } else {
        ProgressView()
      }
    }
    .interactiveDismissDisabled(confirmation.state == .syncing)
    .task(id: attempt) {
      let generation = backend.sessionGeneration
      failed = false
      availabilityChanged(true)
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          guard let id = user?._id else { throw BillingFailure.unavailable }
          try await BillingIdentity.select(id, environment: backend.environment)
          try Task.checkCancellation()
          if destination == .paywall {
            guard let current = try await PaywallOffer.load(copy: copy) else { throw BillingFailure.unavailable }
            offer = current
          }
          try Task.checkCancellation()
          guard backend.sessionGeneration == generation else { return }
          session = generation
          userID = id
          return
        }
      } catch { if !Task.isCancelled { failed = true; availabilityChanged(false) } }
    }
  }

  private func finish(_ info: CustomerInfo) {
    let key = backend.environment.variant == .production ? "Shelvr Pro" : "shelvr_pro"
    guard info.entitlements.active[key] != nil else { return }
    sync()
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

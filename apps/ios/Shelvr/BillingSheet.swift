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
  var goalVariables: [String: String] = [:]
  var unavailable: () -> Void = {}
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
  @State private var syncing = false
  @State private var syncFailed = false

  var body: some View {
    Group {
      if noPurchase {
        ContentUnavailableView(copy("pro.notFoundTitle"), systemImage: "creditcard",
          description: Text(copy("pro.notFoundBody", ["store": "App Store"])))
      } else if failed || syncFailed {
        ContentUnavailableView {
          Label(copy(destination == .restore ? "pro.restoreFailed" : "pro.loadFailed"), systemImage: "exclamationmark.circle")
        } actions: {
          Button(copy("common.retry")) {
            if syncFailed { sync() } else { attempt += 1 }
          }
        }
      } else if syncing {
        ProgressView(copy("pro.checking"))
      } else if userID != nil, destination == .manage {
        CustomerCenterView()
      } else if let offer, userID != nil {
        PaywallView(offering: offer.offering, displayCloseButton: true)
          .customPaywallVariables(offer.variables.merging(goalVariables.mapValues(CustomVariableValue.string)) { $1 })
          .onRequestedDismissal { if !syncing { dismiss() } }
          .onPurchaseCompleted { info in finish(info) }
          .onRestoreCompleted { info in finish(info) }
      } else {
        ProgressView()
      }
    }
    .interactiveDismissDisabled(syncing)
    .task(id: attempt) {
      let generation = backend.sessionGeneration
      failed = false
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
          if destination == .restore {
            let info = try await Purchases.shared.restorePurchases()
            try Task.checkCancellation()
            guard backend.sessionGeneration == generation, Purchases.shared.appUserID == id else { return }
            let key = backend.environment.variant == .production ? "Shelvr Pro" : "shelvr_pro"
            if info.entitlements.active[key] == nil { noPurchase = true } else { sync() }
          }
          return
        }
      } catch { if !Task.isCancelled { failed = true; unavailable() } }
    }
  }

  private func finish(_ info: CustomerInfo) {
    let key = backend.environment.variant == .production ? "Shelvr Pro" : "shelvr_pro"
    guard info.entitlements.active[key] != nil else { return }
    sync()
  }

  private func sync() {
    guard !syncing, backend.sessionGeneration == session, let userID, Purchases.shared.appUserID == userID else { return }
    syncing = true
    syncFailed = false
    Task {
      defer { syncing = false }
      do {
        guard backend.sessionGeneration == session else { return }
        let active: Bool = try await backend.client.action("subscriptions:syncPurchase")
        guard active, backend.sessionGeneration == session, backend.status == .signedIn, Purchases.shared.appUserID == userID else {
          throw BillingFailure.unavailable
        }
        confirmed()
        dismiss()
      } catch { syncFailed = true }
    }
  }
}

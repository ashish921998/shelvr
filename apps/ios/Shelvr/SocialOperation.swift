import ShelvrKit
import SwiftUI

@MainActor @Observable
final class SocialOperation {
  let placement: String
  var billing: BillingDestination?
  var failed = false
  private(set) var busy = false
  private var resume: (@MainActor () async throws -> Void)?
  private var resumeCounts = true

  init(placement: String = "pro_gate") { self.placement = placement }

  func run(_ action: @escaping @MainActor () async throws -> Void, allowPurchase: Bool = true) {
    guard !busy, billing == nil else { return }
    busy = true
    Task {
      defer { busy = false }
      do {
        try await action()
        if resumeCounts, let event = PaywallFunnel.shared.resume(placement) { Analytics.capture("paywall_blocked_action_resumed", event) }
      } catch {
        if allowPurchase && SaveFailure(error) == .proRequired {
          PaywallFunnel.shared.block(placement)
          resume = action
          resumeCounts = true
          billing = .paywall
        } else { failed = true }
      }
    }
  }

  func askToPurchase(then action: (@MainActor () async throws -> Void)? = nil) {
    resume = action
    resumeCounts = false
    billing = .paywall
  }

  func confirmed() {
    let next = resume
    resume = nil
    billing = nil
    if let next { run(next, allowPurchase: false) }
  }

  func dismissed() { resume = nil }
}

extension View {
  func socialOperation(_ operation: SocialOperation, failure: String, close: String) -> some View {
    @Bindable var operation = operation
    return sheet(item: $operation.billing, onDismiss: { operation.dismissed() }) { destination in
      BillingSheet(destination: destination, placement: operation.placement, confirmed: { operation.confirmed() })
    }
    .alert(failure, isPresented: $operation.failed) { Button(close) {} }
  }
}

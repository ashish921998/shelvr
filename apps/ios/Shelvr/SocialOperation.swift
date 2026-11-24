import ShelvrKit
import SwiftUI

@MainActor @Observable
final class SocialOperation {
  var billing: BillingDestination?
  var failed = false
  private(set) var busy = false
  private var resume: (@MainActor () async throws -> Void)?

  func run(_ action: @escaping @MainActor () async throws -> Void, allowPurchase: Bool = true) {
    guard !busy, billing == nil else { return }
    busy = true
    Task {
      defer { busy = false }
      do { try await action() }
      catch {
        if allowPurchase && PastedLink.requiresPro(error) {
          resume = action
          billing = .paywall
        } else { failed = true }
      }
    }
  }

  func askToPurchase() { billing = .paywall }

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
      BillingSheet(destination: destination) { operation.confirmed() }
    }
    .alert(failure, isPresented: $operation.failed) { Button(close) {} }
  }
}

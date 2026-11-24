import CoreFoundation
import ShelvrInbox
import ShelvrKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct SharedInboxReceiver: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
  @Environment(\.copy) private var copy
  @State private var failure: ShareInboxProcessor.Failure?
  @State private var billing: BillingDestination?
  @State private var retryAfterBilling = false

  func body(content: Content) -> some View {
    content
      .onChange(of: phase) { _, phase in InboxSignal.shared.updatePhase(phase) }
      .onChange(of: backend.status, initial: true) { syncOwner() }
      .onChange(of: backend.userID) {
        failure = nil
        retryAfterBilling = false
        billing = nil
        syncOwner()
      }
      .task { await receive() }
      .sheet(item: $billing, onDismiss: {
        if retryAfterBilling {
          retryAfterBilling = false
          InboxSignal.shared.wake()
        }
      }) { destination in
        BillingSheet(destination: destination, confirmed: { retryAfterBilling = true })
      }
      .alert(copy("share.singleFailure"), isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
        if failure?.requiresPro == true {
          Button(copy("freePlan.seePlans")) { billing = .paywall }
        } else if let failure, failure.canRecoverNote, let share = failure.share {
          Button(copy("share.copyNote")) { copyRecoveredNote(share) }
        } else {
          Button(copy("common.tryAgain")) { failure = nil; InboxSignal.shared.wake() }
        }
        if let failure, !failure.canRecoverNote, let share = failure.share {
          Button(copy("common.delete"), role: .destructive) {
            try? share.discard()
            InboxSignal.shared.wake()
          }
        }
        Button(copy("common.close"), role: .cancel) {}
      } message: {
        if let failure { Text(copy(failure.copyKey)) }
      }
  }

  private func copyRecoveredNote(_ share: PendingShare) {
    guard let owner = backend.userID else { return }
    let copied = try? share.copyAndRemoveNote(for: owner) { text in
      guard !SiriText.fitsLibrary(text) else { return false }
      UIPasteboard.general.setItems([[UTType.utf8PlainText.identifier: text]], options: [.localOnly: true])
      return UIPasteboard.general.string == text
    }
    if copied == true { failure = nil; InboxSignal.shared.wake() }
  }

  private func syncOwner() {
    if let inbox = ShareInbox.system(), backend.status == .signedOut || backend.status == .signedIn {
      do { try ShareInboxProcessor(inbox: inbox, backend: backend).updateOwner() }
      catch { try? inbox.activate(nil) }
    }
    InboxSignal.shared.wake()
  }

  private func receive() async {
    guard let inbox = ShareInbox.system() else { return }
    let processor = ShareInboxProcessor(inbox: inbox, backend: backend)
    for await currentPhase in InboxSignal.shared.events(initialPhase: phase) {
      guard !Task.isCancelled else { return }
      if backend.status == .signedOut {
        try? inbox.prune(keeping: nil)
        continue
      }
      guard currentPhase == .active, failure == nil, billing == nil, let owner = backend.userID else { continue }
      do {
        let result = try await processor.drain(owner: owner, deliverSiri: SiriInboxDelivery(backend: backend).send)
        if !Task.isCancelled, backend.userID == owner { failure = result }
      }
      catch ShareInboxError.ownerChanged {}
      catch where !Task.isCancelled && backend.userID == owner { failure = .init() }
      catch {}
    }
  }
}

@MainActor private final class InboxSignal {
  static let shared = InboxSignal()
  private var continuation: AsyncStream<ScenePhase>.Continuation?
  private var phase = ScenePhase.inactive

  private init() {
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(), { _, _, _, _, _ in
        Task { @MainActor in InboxSignal.shared.wake() }
      }, ShareInbox.notification as CFString, nil, .deliverImmediately)
  }

  func events(initialPhase: ScenePhase) -> AsyncStream<ScenePhase> {
    continuation?.finish()
    let pair = AsyncStream<ScenePhase>.makeStream(bufferingPolicy: .bufferingNewest(1))
    continuation = pair.continuation
    updatePhase(initialPhase)
    return pair.stream
  }

  func updatePhase(_ phase: ScenePhase) {
    self.phase = phase
    wake()
  }

  func wake() { continuation?.yield(phase) }
}

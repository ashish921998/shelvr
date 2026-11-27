import ShelvrKit
import SwiftUI

struct RefundSharingPreference: View {
  private struct Consent: Decodable {
    let refundSharing: Bool
    let syncPending: Bool
    let syncFailed: Bool
  }

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var consent: Consent?
  @State private var loaded = false
  @State private var loadFailed = false
  @State private var reviewing = false
  @State private var saving = false
  @State private var saveFailed = false
  @State private var attempt = 0

  private var sharing: Bool { consent?.refundSharing == true }

  var body: some View {
    Section {
      if loadFailed {
        Button(copy("common.retry")) { attempt += 1 }
      } else if loaded {
        Text(copy(sharing ? "refundConsent.enabled" : "refundConsent.disabled"))
        if let consent, consent.syncFailed || consent.syncPending {
          Text(copy(consent.syncFailed ? "refundConsent.syncFailed" : "refundConsent.syncPending"))
            .font(.footnote).foregroundStyle(.secondary)
        }
        Button(copy(sharing ? "refundConsent.withdraw" : "refundConsent.review")) {
          saveFailed = false
          if sharing { save(accepted: nil) } else { reviewing = true }
        }.disabled(saving)
        if saveFailed && !reviewing { Text(copy("refundConsent.error")).foregroundStyle(.red) }
      } else { ProgressView() }
    } header: {
      Text(copy("refundConsent.setting"))
    }
    .task(id: attempt) {
      loadFailed = false
      do {
        for try await value in backend.query("legalConsent:get", as: Consent?.self) {
          try Task.checkCancellation()
          consent = value
          loaded = true
        }
      } catch {
        if !Task.isCancelled { loadFailed = true; loaded = false }
      }
    }
    .sheet(isPresented: $reviewing) {
      NavigationStack {
        Form {
          Section {
            Text(copy("refundConsent.disclosure"))
            Text(copy("refundConsent.optional"))
            Link(copy("legal.terms"), destination: URL(string: "https://tryshelvr.app/terms")!)
            Link(copy("legal.privacy"), destination: URL(string: "https://tryshelvr.app/privacy")!)
          }
          Section {
            Button(copy("refundConsent.accept")) { save(accepted: true) }
            Button(copy("refundConsent.later")) { save(accepted: false) }
            if saveFailed { Text(copy("refundConsent.error")).foregroundStyle(.red) }
          }.disabled(saving)
        }
        .navigationTitle(copy("refundConsent.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          Button(copy("common.close")) { saveFailed = false; reviewing = false }.disabled(saving)
        }
      }
      .interactiveDismissDisabled(saving)
    }
  }

  private func save(accepted: Bool?) {
    guard !saving, let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    saving = true
    saveFailed = false
    Task {
      defer { saving = false }
      guard backend.userID == owner, backend.sessionGeneration == session else { return }
      do {
        if let accepted {
          try await backend.client.mutation("legalConsent:review", with: ["version": "2026-09-19", "accepted": accepted])
        } else {
          try await backend.client.mutation("legalConsent:withdraw")
        }
        guard backend.userID == owner, backend.sessionGeneration == session else { return }
        reviewing = false
      } catch {
        guard backend.userID == owner, backend.sessionGeneration == session else { return }
        Analytics.failure(accepted == nil ? "refund_consent_withdraw_failed" : "legal_consent_save_failed")
        saveFailed = true
      }
    }
  }
}

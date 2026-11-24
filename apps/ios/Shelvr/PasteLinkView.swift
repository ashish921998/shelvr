import ShelvrKit
import SwiftUI

struct PasteLinkView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var input = ""
  @State private var pending: PastedLink?
  @State private var presented = false
  @State private var billing: BillingDestination?
  @State private var resumeSave = false
  @State private var saving = false
  @State private var errorMessage: String?
  @FocusState private var focused: Bool

  var body: some View {
    Form {
      Section {
        TextField(copy("capture.linkPlaceholder"), text: $input)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.URL)
          .focused($focused)
          .onSubmit(save)
          .disabled(saving)
      } footer: {
        Text(copy("capture.linkHint"))
      }
      if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
    }
    .navigationTitle(copy("capture.articleTitle"))
    .toolbar {
      Button(copy("common.save"), action: save)
        .disabled(saving || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    .sheet(item: $billing, onDismiss: {
      if resumeSave { resumeSave = false; save() }
    }) { destination in
      BillingSheet(destination: destination, confirmed: { resumeSave = true })
    }
    .onAppear { presented = true; focused = true }
    .onDisappear { presented = false }
  }

  private func save() {
    guard !saving else { return }
    guard let link = PastedLink(input, retrying: pending) else {
      errorMessage = copy("errors.notALink")
      return
    }
    let properties = ["save_source": "manual_link", "save_kind": "link", "operation_id": link.operationID]
    Analytics.capture("save_attempt_started", properties)
    pending = link
    saving = true
    errorMessage = nil
    Task {
      defer { saving = false }
      do {
        let _: String = try await backend.client.mutation("items:createLinkItem", with: [
          "url": link.url, "operationId": link.operationID, "saveSource": "manual_link"
        ])
        Analytics.capture("article_saved")
        if presented { dismiss() }
      } catch {
        Analytics.capture("save_failed", properties.merging(["stage": PastedLink.requiresPro(error) ? "pro_required" : "other"]) { $1 })
        guard presented else { return }
        if PastedLink.requiresPro(error) {
          errorMessage = copy("freePlan.leftBody")
          billing = .paywall
        } else { errorMessage = copy("errors.tryAgain") }
      }
    }
  }
}

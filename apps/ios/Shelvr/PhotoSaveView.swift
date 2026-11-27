import PhotosUI
import ShelvrKit
import SwiftUI

struct PhotoSaveView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var selection: PhotosPickerItem?
  @State private var operationID = UUID().uuidString
  @State private var request: UUID?
  @State private var billing: BillingDestination?
  @State private var offered: String?
  @State private var failure: String?

  var body: some View {
    let title = copy("item.photo")
    let icon = selection == nil ? "photo" : "checkmark.circle"
    Form {
      PhotosPicker(selection: $selection, matching: .images) {
        Label(title, systemImage: icon)
      }
      .disabled(request != nil)
      if let failure {
        Text(copy(failure)).foregroundStyle(.red)
        if failure == "freePlan.photosNeedPro" {
          Button(copy("freePlan.seePlans")) { offered = operationID; PaywallFunnel.shared.block("add"); billing = .paywall }
        }
      }
    }
    .navigationTitle(title)
    .toolbar {
      Button(copy("common.save")) { request = UUID() }
        .disabled(selection == nil || request != nil)
    }
    .sheet(item: $billing) { destination in
      BillingSheet(destination: destination, placement: "add", confirmed: {
        if offered == operationID, selection != nil { request = UUID() }
      })
    }
    .onChange(of: selection) {
      operationID = UUID().uuidString
      failure = nil
    }
    .onDisappear { request = nil }
    .task(id: request) {
      if let request, let selection { await save(selection, request: request) }
    }
  }

  private func save(_ selection: PhotosPickerItem, request id: UUID) async {
    defer { if request == id { request = nil } }
    guard let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    let saveOperation = "image:\(operationID)"
    let analyticsSessionID = Analytics.sessionID
    failure = nil
    let properties = ["save_source": "photo_import", "save_kind": "image", "operation_id": saveOperation]
    Analytics.capture("save_attempt_started", properties)
    do {
      guard let data = try await selection.loadTransferable(type: Data.self) else {
        throw CocoaError(.fileReadCorruptFile)
      }
      try Task.checkCancellation()
      let photo = try await Task.detached { try ImportPhoto(data) }.value
      _ = try await backend.savePhoto(photo, operationID: saveOperation, analyticsSessionID: analyticsSessionID) {
        try Task.checkCancellation()
        guard backend.userID == owner, backend.sessionGeneration == session else { throw CancellationError() }
      }
      guard !Task.isCancelled, request == id, backend.userID == owner, backend.sessionGeneration == session else { return }
      Analytics.capture("images_saved", ["image_count": 1])
      if let resumed = PaywallFunnel.shared.resume("add") { Analytics.capture("paywall_blocked_action_resumed", resumed) }
      dismiss()
    } catch {
      if !Task.isCancelled, request == id, backend.userID == owner, backend.sessionGeneration == session {
        let saveFailure = SaveFailure(error)
        failure = saveFailure.photoCopyKey
        Analytics.capture("save_failed", properties.merging(["stage": saveFailure.stage]) { $1 })
        Analytics.capture("images_save_failed", ["reason": saveFailure.imageReason, "image_count": 1])
        if failure == "freePlan.photosNeedPro" && offered != operationID {
          offered = operationID; PaywallFunnel.shared.block("add"); billing = .paywall
        }
      }
    }
  }
}

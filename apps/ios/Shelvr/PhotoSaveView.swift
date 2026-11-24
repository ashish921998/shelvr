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
          Button(copy("freePlan.seePlans")) { offered = operationID; billing = .paywall }
        }
      }
    }
    .navigationTitle(title)
    .toolbar {
      Button(copy("common.save")) { request = UUID() }
        .disabled(selection == nil || request != nil)
    }
    .sheet(item: $billing) { destination in
      BillingSheet(destination: destination, confirmed: {
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
    failure = nil
    do {
      guard let data = try await selection.loadTransferable(type: Data.self) else {
        throw CocoaError(.fileReadCorruptFile)
      }
      try Task.checkCancellation()
      let photo = try await Task.detached { try ImportPhoto(data) }.value
      _ = try await backend.savePhoto(photo, operationID: "image:\(operationID)")
      if !Task.isCancelled, request == id { dismiss() }
    } catch {
      if !Task.isCancelled, request == id {
        failure = ImportPhoto.failureCopy(error)
        if failure == "freePlan.photosNeedPro" && offered != operationID {
          offered = operationID; billing = .paywall
        }
      }
    }
  }
}

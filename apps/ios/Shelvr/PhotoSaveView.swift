import PhotosUI
import ShelvrKit
import SwiftUI

struct PhotoSaveView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var selection: PhotosPickerItem?
  @State private var operationID = UUID().uuidString
  @State private var saving = false
  @State private var presented = false
  @State private var failure: String?

  var body: some View {
    let title = copy("item.photo")
    let symbol = selection == nil ? "photo" : "checkmark.circle"
    Form {
      PhotosPicker(selection: $selection, matching: .images) {
        Label(title, systemImage: symbol)
      }
      .disabled(saving)
      if let failure { Text(copy(failure)).foregroundStyle(.red) }
    }
    .navigationTitle(copy("item.photo"))
    .toolbar {
      Button(copy("common.save"), action: save)
        .disabled(selection == nil || saving)
    }
    .onChange(of: selection) {
      operationID = UUID().uuidString
      failure = nil
    }
    .onAppear { presented = true }
    .onDisappear { presented = false }
  }

  private func save() {
    guard !saving, let selection else { return }
    saving = true
    failure = nil
    Analytics.capture("save_attempt_started", ["save_source": "photo_import", "save_kind": "image", "operation_id": "image:\(operationID)"])
    Task {
      defer { saving = false }
      do {
        guard let data = try await selection.loadTransferable(type: Data.self) else {
          throw CocoaError(.fileReadCorruptFile)
        }
        let photo = try await Task.detached { try ImportPhoto(data) }.value
        _ = try await backend.savePhoto(photo, operationID: "image:\(operationID)")
        Analytics.capture("images_saved", ["image_count": 1])
        if presented { dismiss() }
      } catch {
        failure = ImportPhoto.failureCopy(error)
      }
    }
  }
}

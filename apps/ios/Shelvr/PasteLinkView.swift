import ShelvrKit
import SwiftUI

struct PasteLinkView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var input = ""
  @State private var pending: PastedLink?
  @State private var presented = false
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
    .onAppear { presented = true; focused = true }
    .onDisappear { presented = false }
  }

  private func save() {
    guard !saving else { return }
    guard let link = PastedLink(input, retrying: pending) else {
      errorMessage = copy("errors.notALink")
      return
    }
    pending = link
    saving = true
    errorMessage = nil
    Task {
      defer { saving = false }
      do {
        try await backend.saveLink(link.url, operationID: link.operationID, source: .manualLink)
        if presented { dismiss() }
      } catch {
        errorMessage = SaveFailure(error) == .proRequired ? copy("freePlan.leftBody") : copy("errors.tryAgain")
      }
    }
  }
}

import ShelvrKit
import SwiftUI

@MainActor @Observable
final class MemberNamePrompts {
  private var asked: UUID?

  func claim(for session: UUID) -> Bool {
    guard asked != session else { return false }
    asked = session
    return true
  }
}

struct MemberNamePrompt: View {
  let kind: String
  let done: () -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var saving = false
  @State private var failed = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(copy("sharedLists.yourName"), text: $name).textContentType(.givenName)
        } footer: {
          Text(copy(kind == "create" ? "sharedLists.nameBodyCreate" : "sharedLists.nameBodyJoinNoName"))
        }
        Button(copy("common.save")) {
          let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !clean.isEmpty, clean.utf16.count <= 80, !saving else { return }
          saving = true
          Task {
            defer { saving = false }
            do {
              let _: String = try await backend.client.mutation("users:setMyName", with: ["name": clean])
              Analytics.capture("shared_list_name_prompt", ["kind": kind, "outcome": "named"])
              dismiss()
              done()
            } catch { failed = true }
          }
        }.disabled(saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.utf16.count > 80)
        Button(copy("sharedLists.nameSkip")) {
          Analytics.capture("shared_list_name_prompt", ["kind": kind, "outcome": "skipped"])
          dismiss(); done()
        }.disabled(saving)
      }
      .navigationTitle(copy("sharedLists.nameTitle"))
      .interactiveDismissDisabled(saving)
      .alert(copy("sharedLists.nameFailed"), isPresented: $failed) { Button(copy("common.close")) {} }
    }
  }
}

import ShelvrKit
import SwiftUI

struct AccountSettingsView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var confirming = false
  @State private var deleting = false
  @State private var failure = false
  @State private var manage = false

  var body: some View {
    List {
      Section {
        Button(copy("pro.manage")) { manage = true }
        Link(copy("support.contact"), destination: URL(string: "mailto:ashish921998@zohomail.in?subject=Shelvr%20Support")!)
        Link(copy("legal.terms"), destination: URL(string: "https://tryshelvr.app/terms")!)
        Link(copy("legal.privacy"), destination: URL(string: "https://tryshelvr.app/privacy")!)
      }
      Section {
        Button(copy(deleting ? "account.deleting" : "account.delete"), role: .destructive) {
          confirming = true
        }
        .disabled(deleting)
        if failure { Text(copy("account.deleteFailed")).foregroundStyle(.red) }
      }
    }
    .navigationTitle(copy("profile.settings"))
    .sheet(isPresented: $manage) { BillingSheet(destination: .manage) }
    .alert(copy("account.deleteTitle"), isPresented: $confirming) {
      Button(copy("common.cancel"), role: .cancel) {}
      Button(copy("pro.manage")) { manage = true }
      Button(copy("account.delete"), role: .destructive, action: deleteAccount)
    } message: {
      Text(["account.deleteIntro", "account.deleteItems", "account.deleteSpaces",
        "account.deleteUploads", "account.subscriptionWarning"].map { copy($0) }.joined(separator: "\n"))
    }
  }

  private func deleteAccount() {
    guard !deleting else { return }
    deleting = true
    failure = false
    Task {
      defer { deleting = false }
      do { try await backend.deleteAccount() } catch { failure = true }
    }
  }
}

import ShelvrKit
import SwiftUI

struct AccountView: View {
  struct CurrentUser: Decodable {
    let _id: String
    let email: String?
  }

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var user: CurrentUser?
  @State private var billing: BillingDestination?
  @State private var signOutFailed = false

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "checkmark.seal.fill")
        .font(.system(size: 44))
        .foregroundStyle(Color.accentColor)
      Text(user?.email ?? user?._id ?? " ")
        .font(.headline)
        .accessibilityIdentifier("signed-in-user")
      SaveReminderPreference()
      NavigationLink(copy("profile.settings")) { AccountSettingsView() }
      Button(copy("pro.viewPlans")) { billing = .paywall }
      Button(copy("pro.manage")) { billing = .manage }
      Button(copy("account.signOut")) {
        Task {
          do {
            try await backend.signOut()
          } catch {
            signOutFailed = true
          }
        }
      }
      .buttonStyle(.signIn)
      .padding(.top, 24)
      if signOutFailed {
        Text(copy("account.signOutFailed"))
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
    .sheet(item: $billing) { BillingSheet(destination: $0) }
    .padding(24)
    .task {
      do {
        for try await user in backend.query("users:getCurrentUser", as: CurrentUser?.self) {
          self.user = user
        }
      } catch {}
    }
  }
}

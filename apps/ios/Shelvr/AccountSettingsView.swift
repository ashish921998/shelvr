import ShelvrKit
import SwiftUI
import UserNotifications

struct AccountSettingsView: View {
  @EnvironmentObject private var pushDevice: PushDevice
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var confirming = false
  @State private var deleting = false
  @State private var failure = false
  @State private var billing: BillingDestination?

  var body: some View {
    List {
      Section {
        SaveReminderPreference()
        Button(copy("onboardingNotify.allow")) {
          Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .denied {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                await UIApplication.shared.open(url)
              }
            } else if (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) == true {
              pushDevice.authorizationRevision += 1
            }
          }
        }
        Button(copy("pro.restore")) { billing = .restore }
        Button(copy("pro.manage")) { billing = .manage }
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
    .sheet(item: $billing) { BillingSheet(destination: $0) }
    .alert(copy("account.deleteTitle"), isPresented: $confirming) {
      Button(copy("common.cancel"), role: .cancel) {}
      Button(copy("pro.manage")) { billing = .manage }
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
      do { try await backend.deleteAccount() } catch { Analytics.failure("account_deletion_failed"); failure = true }
    }
  }
}

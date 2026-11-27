import ShelvrKit
import SwiftUI
import UserNotifications

struct AccountSettingsView: View {
  @Environment(\.scenePhase) private var phase
  @EnvironmentObject private var pushDevice: PushDevice
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var confirming = false
  @State private var deleting = false
  @State private var failure = false
  @State private var billing: BillingDestination?
  @State private var denied = false
  @State private var restored = false

  var body: some View {
    List {
      Section {
        SaveReminderPreference()
        if denied, let settings = URL(string: UIApplication.openNotificationSettingsURLString) {
          Link(copy("permissions.openSettings"), destination: settings)
        }
        Button(copy("pro.restore")) { restored = false; billing = .restore }
        if restored { Text(copy("pro.restoredTitle")).foregroundStyle(.secondary) }
        Button(copy("pro.manage")) { billing = .manage }
        if pushDevice.blockedSession == backend.sessionGeneration {
          Text(copy("notifications.previousAccount")).foregroundStyle(.secondary)
        }
        Link(copy("support.contact"), destination: URL(string: "mailto:ashish921998@zohomail.in?subject=Shelvr%20Support")!)
        Link(copy("legal.terms"), destination: URL(string: "https://tryshelvr.app/terms")!)
        Link(copy("legal.privacy"), destination: URL(string: "https://tryshelvr.app/privacy")!)
      }
      RefundSharingPreference()
      Section {
        Button(copy(deleting ? "account.deleting" : "account.delete"), role: .destructive) {
          confirming = true
        }
        .disabled(deleting)
        if failure { Text(copy("account.deleteFailed")).foregroundStyle(.red) }
      }
    }
    .navigationTitle(copy("profile.settings"))
    .task(id: phase) {
      if phase == .active { denied = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .denied }
    }
    .sheet(item: $billing) { destination in
      BillingSheet(destination: destination, confirmed: { if destination == .restore { restored = true } })
    }
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

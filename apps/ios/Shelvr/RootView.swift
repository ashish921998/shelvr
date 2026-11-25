import ShelvrKit
import SwiftUI

struct RootView: View {
  @EnvironmentObject private var pushDevice: PushDevice
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var namePrompts = MemberNamePrompts()
  @State private var invites = InviteEntry()
  @State private var pendingLink: AppLink?

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut, .signedIn: InviteEntryView(entry: invites, pendingLink: $pendingLink)
      case .offline: OfflineView()
      }
    }
    .environment(invites)
    .environment(namePrompts)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(appearance == "neutralDark" ? Color(red: 17/255, green: 20/255, blue: 23/255) : Color(.background))
    .preferredColorScheme(appearance == "system" ? nil : appearance == "light" ? .light : .dark)
    .foregroundStyle(Color(.foreground))
    .onChange(of: pushDevice.link, initial: true) { _, link in
      if let link { route(link); pushDevice.link = nil }
    }
    .onChange(of: backend.sessionGeneration) { _, session in
      if let queued = invites.discardNavigation(unless: session) { route(queued) }
    }
    .task(id: backend.sessionGeneration) {
      if backend.status == .signedOut { Analytics.identify(nil) }
      if backend.status == .offline {
        let id = await backend.offlineAccountID()
        guard !Task.isCancelled, backend.status == .offline else { return }
        Analytics.restoredOffline(accountID: id)
      }
      guard backend.status == .signedIn else { return }
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          try Task.checkCancellation()
          Analytics.identify(user?._id)
        }
      } catch { if !Task.isCancelled { Analytics.failure("analytics_identity_failed") } }
    }
    .modifier(SharedInboxReceiver())
    .modifier(RecentWidgetSync())
    .modifier(SiriSetup())
    .onOpenURL { url in
      if let link = AppLink(url.absoluteString), link.path != ["sign-in"] { route(link) }
    }
    .onChange(of: backend.status, initial: true) { _, status in
      if status == .signedOut { LocalTrialNotifications.shared.replace([], copy: copy) }
    }
    .animation(.default, value: backend.status)
  }
  private func route(_ link: AppLink) {
    if !invites.route(link) { pendingLink = link }
  }

}

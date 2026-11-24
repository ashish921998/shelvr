import ShelvrKit
import SwiftUI

struct RootView: View {
  @EnvironmentObject private var pushDevice: PushDevice
  @Environment(Backend.self) private var backend
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var pendingLink: AppLink?

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut: SignInView()
      case .signedIn: OnboardingGate(pendingLink: $pendingLink)
      case .offline: OfflineView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(appearance == "neutralDark" ? Color(red: 17/255, green: 20/255, blue: 23/255) : Color(.background))
    .preferredColorScheme(appearance == "system" ? nil : appearance == "light" ? .light : .dark)
    .foregroundStyle(Color(.foreground))
    .onChange(of: pushDevice.link, initial: true) { _, link in
      if let link { pendingLink = link; pushDevice.link = nil }
    }
    .task(id: backend.sessionGeneration) {
      if backend.status == .signedOut { Analytics.identify(nil) }
      if backend.status == .offline, let id = await backend.offlineAccountID(), !Task.isCancelled {
        Analytics.identify(id)
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
      if let link = AppLink(url.absoluteString), link.path != ["sign-in"] { pendingLink = link }
    }
    .animation(.default, value: backend.status)
  }
}

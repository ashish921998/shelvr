import ShelvrKit
import SwiftUI

struct RootView: View {
  @EnvironmentObject private var pushDevice: PushDevice
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var pendingLink: AppLink?

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut: SignInView()
      case .signedIn: OnboardingGate(pendingLink: $pendingLink).id(backend.sessionGeneration)
      case .offline: OfflineView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.background))
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
    .onChange(of: backend.status, initial: true) { _, status in
      if status == .signedOut { LocalTrialNotifications.shared.replace([], copy: copy) }
    }
    .animation(.default, value: backend.status)
  }
}

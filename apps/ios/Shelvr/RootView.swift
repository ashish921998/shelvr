import ShelvrKit
import SwiftUI

struct RootView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var pendingLink: AppLink?

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut: SignInView()
      case .signedIn: SignedInView(pendingLink: $pendingLink).id(backend.sessionGeneration)
      case .offline: OfflineView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.background))
    .foregroundStyle(Color(.foreground))
    .modifier(SharedInboxReceiver())
    .onOpenURL { url in
      if let link = AppLink(url.absoluteString), link.path != ["sign-in"] { pendingLink = link }
    }
    .onChange(of: backend.status, initial: true) { _, status in
      if status == .signedOut { LocalTrialNotifications.shared.replace([], copy: copy) }
    }
    .animation(.default, value: backend.status)
  }
}

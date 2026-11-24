import ShelvrKit
import SwiftUI

struct RootView: View {
  @Environment(Backend.self) private var backend
  @State private var pendingLink: AppLink?

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut: SignInView()
      case .signedIn: SignedInView(pendingLink: $pendingLink)
      case .offline: OfflineView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.background))
    .foregroundStyle(Color(.foreground))
    .modifier(SharedInboxReceiver())
    .modifier(RecentWidgetSync())
    .modifier(SiriSetup())
    .onOpenURL { url in
      if let link = AppLink(url.absoluteString), link.path != ["sign-in"] { pendingLink = link }
    }
    .animation(.default, value: backend.status)
  }
}

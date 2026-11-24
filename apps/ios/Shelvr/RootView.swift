import ShelvrKit
import SwiftUI

struct RootView: View {
  @Environment(Backend.self) private var backend
  @AppStorage("swift.appearance") private var appearance = "system"
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
    .background(appearance == "neutralDark" ? Color(red: 17/255, green: 20/255, blue: 23/255) : Color(.background))
    .preferredColorScheme(appearance == "system" ? nil : appearance == "light" ? .light : .dark)
    .foregroundStyle(Color(.foreground))
    .modifier(SharedInboxReceiver())
    .onOpenURL { url in
      if let link = AppLink(url.absoluteString), link.path != ["sign-in"] { pendingLink = link }
    }
    .animation(.default, value: backend.status)
  }
}

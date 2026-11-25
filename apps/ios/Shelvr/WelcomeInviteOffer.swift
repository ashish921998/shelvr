import ShelvrKit
import SwiftUI

struct WelcomeInviteOffer: View {
  let palette: HomeChromePalette
  @Environment(InviteEntry.self) private var entry
  @Environment(\.copy) private var copy
  @Environment(\.scenePhase) private var phase
  @State private var hasURL = false
  @State private var unavailable = false

  var body: some View {
    Group {
      if hasURL && entry.loaded && entry.accepted == nil && entry.preview == nil {
        Button {
          let board = UIPasteboard.general
          if let url = board.url ?? board.string.flatMap(URL.init(string:)),
            url.scheme?.lowercased() == "https", url.pathComponents.dropFirst().first == "l",
            let link = AppLink(url.absoluteString), PublicInvite(link)?.kind == .list {
            _ = entry.route(link)
          } else { unavailable = true }
        } label: {
          (Text(copy("onboarding.invitedToList") + " ").foregroundStyle(palette.muted)
            + Text(copy("onboarding.joinList")).fontWeight(.bold).foregroundStyle(palette.foreground))
            .font(.custom("Satoshi-Regular", size: 14, relativeTo: .subheadline))
            .frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.plain)
      }
    }
    .onChange(of: phase, initial: true) { _, phase in
      if phase == .active { hasURL = UIPasteboard.general.hasURLs }
    }
    .alert(copy("onboarding.noInviteTitle"), isPresented: $unavailable) { } message: {
      Text(copy("onboarding.noInviteBody"))
    }
  }
}

import ShelvrKit
import SwiftUI

struct RootView: View {
  @Environment(Backend.self) private var backend

  var body: some View {
    Group {
      switch backend.status {
      case .starting: ProgressView()
      case .signedOut: SignInView()
      case .signedIn: SignedInView()
      case .offline: OfflineView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.background))
    .foregroundStyle(Color(.foreground))
    .animation(.default, value: backend.status)
  }
}

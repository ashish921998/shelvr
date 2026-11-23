import ShelvrKit
import SwiftUI

struct OfflineView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: "wifi.slash")
        .font(.system(size: 40))
        .foregroundStyle(Color(.muted))
      Text(copy("errors.connection"))
        .multilineTextAlignment(.center)
      Button(copy("common.tryAgain")) {
        Task { await backend.start() }
      }
      .buttonStyle(.signIn)
    }
    .padding(24)
  }
}

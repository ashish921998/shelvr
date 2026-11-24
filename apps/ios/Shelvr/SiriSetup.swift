import ShelvrKit
import SwiftUI

struct SiriSetup: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase

  func body(content: Content) -> some View {
    content.task(id: "\(backend.status)-\(phase)") {
      guard phase == .active, backend.status == .signedIn else { return }
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          try Task.checkCancellation()
          if let owner = user?._id { try await backend.prepareSiri(owner: owner) }
          return
        }
      } catch {}
    }
  }
}

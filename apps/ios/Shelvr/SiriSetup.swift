import AppIntents
import ShelvrKit
import SwiftUI

struct SiriSetup: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase

  func body(content: Content) -> some View {
    content.task(id: "\(backend.status)-\(phase)") {
      if backend.status == .signedOut { ShelvrShortcuts.updateAppShortcutParameters() }
      guard phase == .active, backend.status == .signedIn else { return }
      do {
        for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
          try Task.checkCancellation()
          if let owner = user?._id {
            try await backend.prepareSiri(owner: owner)
            if !Task.isCancelled, SiriCredential.current()?.owner == owner { ShelvrShortcuts.updateAppShortcutParameters() }
          }
          return
        }
      } catch {}
    }
  }
}

struct SiriFolderRefresh: ViewModifier {
  let entitled: Bool
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase

  private struct Eligibility: Equatable {
    let entitled: Bool
    let active: Bool
  }

  func body(content: Content) -> some View {
    #if compiler(>=6.4)
      if #available(iOS 27.0, *) {
        content.task(id: Eligibility(entitled: entitled, active: phase == .active)) {
          guard entitled else {
            ShelvrShortcuts.updateAppShortcutParameters()
            return
          }
          guard phase == .active, let owner = backend.userID else { return }
          do {
            var previous: [String: String]?
            for try await rows in backend.query("spaces:listSpaces", as: [ShelvrCatalog.Folder].self) {
              guard !Task.isCancelled, backend.userID == owner else { return }
              let names = Dictionary(uniqueKeysWithValues: rows.map { ($0._id, $0.name) })
              if previous != names {
                previous = names
                ShelvrShortcuts.updateAppShortcutParameters()
              }
            }
          } catch { if !Task.isCancelled { Analytics.failure("siri_folder_refresh_failed") } }
        }
      } else { content }
    #else
      content
    #endif
  }
}

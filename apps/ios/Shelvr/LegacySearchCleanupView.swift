import CoreSpotlight
import ShelvrKit
import SwiftUI

struct LegacySearchCleanupView: ViewModifier {
  @Environment(\.scenePhase) private var phase

  func body(content: Content) -> some View {
    content.task(id: phase == .active) {
      guard phase == .active, let catalogs = UserDefaults(suiteName: "dev.expo.appintents") else { return }
      let cleanup = LegacySearchCleanup(defaults: .standard, catalogs: catalogs, documents: .documentsDirectory, caches: .cachesDirectory)
      var delay = 2
      while !Task.isCancelled {
        do {
          try await cleanup.run { domain in
            try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain])
          }
          return
        } catch {
          if Task.isCancelled { return }
          if delay == 2 { Analytics.failure("legacy_spotlight_cleanup_failed") }
          do { try await Task.sleep(for: .seconds(delay)) } catch { return }
          delay = min(delay * 2, 60)
        }
      }
    }
  }
}

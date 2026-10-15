import AppIntents
internal import ExpoAppIntents
internal import ExpoModulesCore

/// App-target glue for expo-app-intents. Registers Shelvr's entity kinds (so catalogs published
/// from JavaScript reach Spotlight and on-screen awareness), and lets the signed-in app hand the
/// native capture intents their credentials. JavaScript side: `src/lib/app-intents.tsx`.
final class AppIntentsSetup: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("AppIntentsSetup")

    OnCreate {
      if #available(iOS 18.0, *) {
        // Plain registration: Spotlight indexing is done by `ShelvrSpotlight`, not the package.
        AppEntityIdentifierRegistry.shared.register(ShelvrCatalog.itemKind, as: ItemEntity.self)
      }
      #if compiler(>=6.4)
      if #available(iOS 27.0, *) {
        AppEntityIdentifierRegistry.shared.register(ShelvrCatalog.spaceKind, as: SpaceEntity.self)
      }
      #endif
      if #available(iOS 18.0, *) {
        Task {
          await AppIntentDispatcher.shared.setShortcutsRefreshHandler {
            ShelvrShortcuts.updateAppShortcutParameters()
          }
          ShelvrShortcuts.updateAppShortcutParameters()
        }
      }
    }

    AsyncFunction("setCaptureCredentials") { (siteUrl: String, token: String) in
      try ShelvrCapture.store(.init(siteUrl: siteUrl, token: token))
    }

    AsyncFunction("clearCaptureCredentials") {
      ShelvrCapture.clear()
      ShelvrIntentLog.clear()
    }

    AsyncFunction("hasCaptureCredentials") { () -> Bool in
      return ShelvrCapture.load() != nil
    }

    // The raw token, so sign-out can revoke it on the server before clearing it here.
    AsyncFunction("captureToken") { () -> String? in
      return ShelvrCapture.load()?.token
    }

    AsyncFunction("indexItemsInSpotlight") { () async throws -> Int in
      guard #available(iOS 18.0, *) else { return 0 }
      return try await ShelvrSpotlight.syncItems()
    }

    AsyncFunction("getIntentLog") { () -> [String] in
      return ShelvrIntentLog.entries()
    }

    AsyncFunction("clearSpotlight") { () async throws in
      try await ShelvrSpotlight.clear()
    }
  }
}

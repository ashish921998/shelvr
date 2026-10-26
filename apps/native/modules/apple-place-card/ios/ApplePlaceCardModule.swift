import ExpoModulesCore
import UIKit

public class ApplePlaceCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ApplePlaceCard")

    Constant("isSupported") { ApplePlaceCardModule.supported }

    AsyncFunction("present") { (appleId: String, saveTitle: String, fromYourSave: String, openSave: String) async -> String in
      guard #available(iOS 18.0, *) else { return "unavailable" }
      return await self.show(
        appleId: appleId,
        saveTitle: saveTitle,
        fromYourSave: fromYourSave,
        openSave: openSave
      )
    }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func show(
    appleId: String,
    saveTitle: String,
    fromYourSave: String,
    openSave: String
  ) async -> String {
    guard let host = appContext?.utilities?.currentViewController() else { return "unavailable" }
    return await ApplePlaceCardPresenter.present(
      appleId: appleId,
      saveTitle: saveTitle,
      fromYourSave: fromYourSave,
      openSave: openSave,
      from: host
    )
  }

  private static var supported: Bool {
    if #available(iOS 18.0, *) { return true }
    return false
  }
}

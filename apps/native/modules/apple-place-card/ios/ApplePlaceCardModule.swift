import ExpoModulesCore
import UIKit

public class ApplePlaceCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ApplePlaceCard")

    Constant("isSupported") { ApplePlaceCardModule.supported }

    AsyncFunction("present") { (appleId: String, request: Int) async -> String in
      guard #available(iOS 18.0, *) else { return "unavailable" }
      return await self.show(appleId: appleId, request: request)
    }

    Function("begin") { PlaceCardRequests.shared.begin() }

    Function("cancel") { PlaceCardRequests.shared.cancel() }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func show(appleId: String, request: Int) async -> String {
    guard let host = appContext?.utilities?.currentViewController() else { return "unavailable" }
    return await ApplePlaceCardPresenter.present(appleId: appleId, request: request, from: host)
  }

  private static var supported: Bool {
    if #available(iOS 18.0, *) { return true }
    return false
  }
}

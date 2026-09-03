import ExpoModulesCore
import Foundation

public class ActivationPalExpoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ActivationPal")

    // Configure during Expo's native module initialization, before React
    // renders. This keeps launch events native and makes the integration
    // survive generated iOS projects where AppDelegate is not committed.
    OnCreate {
      let app = Bundle.main.object(forInfoDictionaryKey: "ActivationPalApp") as? String
      let key = Bundle.main.object(forInfoDictionaryKey: "ActivationPalKey") as? String
      if let app, !app.isEmpty, let key, !key.isEmpty {
        ActivationPal.configure(app: app, key: key)
      }
    }

    Function("configure") { (app: String, key: String, userId: String?) -> Void in
      ActivationPal.configure(app: app, key: key, userId: userId)
    }

    Function("setUserId") { (userId: String?) -> Void in
      ActivationPal.setUserId(userId)
    }

    Function("track") { (name: String, props: [String: Any]?) -> Void in
      ActivationPal.track(name, props)
    }

    Function("onboardingStep") { (index: Int, id: String, answer: String?) -> Void in
      ActivationPal.onboardingStep(index, id: id, answer: answer)
    }

    Function("onboardingCompleted") { () -> Void in
      ActivationPal.onboardingCompleted()
    }

    Function("paywallShown") { (placement: String, presentedAt: Double) -> Void in
      ActivationPal.paywallShown(
        placement,
        at: Date(timeIntervalSince1970: presentedAt / 1_000)
      )
    }

    Function("paywallPlanSelected") { (plan: String) -> Void in
      ActivationPal.paywallPlanSelected(plan)
    }

    Function("paywallPurchased") { (plan: String) -> Void in
      ActivationPal.paywallPurchased(plan)
    }

    Function("paywallDismissed") { () -> Void in
      ActivationPal.paywallDismissed()
    }
  }
}

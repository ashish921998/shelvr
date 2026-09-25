import ExpoModulesCore
import UIKit

public class ProgressiveBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ProgressiveBlur")

    View(ProgressiveBlurView.self) {
      // The blur radius itself is not tunable: the view renders a fixed public
      // UIBlurEffect, and iOS exposes no public API to map a numeric radius onto
      // one. Only where its opacity fades out can be set.
      Prop("fadePastHeader") { (view: ProgressiveBlurView, points: Double) in
        view.fadePastHeader = CGFloat(points)
      }
    }
  }
}

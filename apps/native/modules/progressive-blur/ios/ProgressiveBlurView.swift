import ExpoModulesCore
import UIKit

// A blurred band behind a transparent navigation header. A standard, public
// `UIBlurEffect` is fully visible at the top edge, and the whole effect view's
// opacity feathers to zero near the header's lower edge so the band dissolves
// into the content beneath it.
//
// iOS has no public API for a live, spatially-varying blur radius. Rather than
// reach for undocumented, App-Review-sensitive runtime APIs, this uses only
// documented UIKit and Core Animation APIs: a fixed `UIBlurEffect` whose view
// opacity is faded out by a gradient `CALayer` mask. The result is a close
// visual approximation, not a true per-pixel variable-radius blur.
class ProgressiveBlurView: ExpoView {
  // `.systemChromeMaterial` is the material UIKit gives its own bars, and it is
  // the reason text scrolling under a system navigation bar stops being
  // readable: it layers a tint over the blur, which a plain `.regular` blur has
  // none of — that one smears text but leaves it legible.
  private let blurView = UIVisualEffectView(
    effect: UIBlurEffect(style: .systemChromeMaterial)
  )

  // Opacity mask on the whole effect view. A UIVisualEffectView draws a faint
  // hairline at its own bottom edge no matter its blur radius; only fading the
  // layer's opacity to zero makes that edge disappear. This gradient feathers
  // the view out across the bottom of the band so the hard edge is never seen.
  private let maskLayer = CAGradientLayer()

  // Extra height added below the header band. The UIVisualEffectView renders a
  // faint hairline at its own bottom edge regardless of the mask, so we push
  // that edge this far past the visible fade — into the fully-transparent
  // region — where it can't show over the content. The view is deliberately
  // left un-clipped so this overhang survives.
  private let edgeMargin: CGFloat = 48

  // Where the fade begins when it is kept inside the band (`fadePastHeader`
  // zero), as a fraction of the band. The blur then reads at full strength over
  // the status bar and has largely faded by the navigation bar below it.
  private let insetFadeStart: CGFloat = 0.6

  /// How far below the band the fade finishes, in points. Zero keeps the fade
  /// inside the band; a positive value holds full-strength blur across the
  /// whole band and finishes the fade this far into the content — what a header
  /// whose own text fills the band needs, since an inset fade has already
  /// dissolved where that text sits. Clamped to the overhang so the effect
  /// view's hairline still lands in fully-transparent territory.
  var fadePastHeader: CGFloat = 0 {
    didSet {
      // Assigning inside didSet does not re-enter it, so the clamp is safe here.
      fadePastHeader = min(max(fadePastHeader, 0), edgeMargin)
      guard fadePastHeader != oldValue else { return }
      setNeedsLayout()
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // The blur is purely decorative and must never intercept touches meant for
    // the native header items rendered above it.
    blurView.isUserInteractionEnabled = false
    isUserInteractionEnabled = false
    blurView.layer.mask = maskLayer
    addSubview(blurView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    guard bounds.width > 0, bounds.height > 0 else { return }

    // Extend the blur band `edgeMargin` below the header; the opacity mask fades
    // to zero by the header's bottom edge and stays zero through the overhang.
    let totalSize = CGSize(width: bounds.width, height: bounds.height + edgeMargin)
    blurView.frame = CGRect(origin: .zero, size: totalSize)
    updateOpacityMask(bandHeight: bounds.height, totalSize: totalSize)
  }

  /// Fades the whole effect view's opacity to zero so its backdrop layer's hard
  /// edge is never visible. The gradient axis spans the fade alone:
  /// CAGradientLayer holds its first color above `startPoint` (opaque, so the
  /// blur reads at full strength there) and its last one below `endPoint`
  /// (clear, masking out the overhang), which leaves only the fade to describe.
  private func updateOpacityMask(bandHeight: CGFloat, totalSize: CGSize) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }

    maskLayer.frame = CGRect(origin: .zero, size: totalSize)

    let fadeStart = fadePastHeader > 0 ? bandHeight : bandHeight * insetFadeStart
    let fadeEnd = bandHeight + fadePastHeader
    maskLayer.startPoint = CGPoint(x: 0.5, y: fadeStart / totalSize.height)
    maskLayer.endPoint = CGPoint(x: 0.5, y: fadeEnd / totalSize.height)

    let steps = 48
    var colors: [CGColor] = []
    var locations: [NSNumber] = []
    for i in 0...steps {
      let u = CGFloat(i) / CGFloat(steps)
      let smootherstep = u * u * u * (u * (u * 6 - 15) + 10)
      colors.append(UIColor.white.withAlphaComponent(1 - smootherstep).cgColor)
      locations.append(NSNumber(value: Double(u)))
    }
    maskLayer.colors = colors
    maskLayer.locations = locations
  }
}

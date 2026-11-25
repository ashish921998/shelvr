import UIKit

final class MapPlaceNameBadge: UIView {
  private static let font = UIFont(name: "Satoshi-Bold", size: 12) ?? .systemFont(ofSize: 12, weight: .semibold)
  private static let ink = UIColor(red: 45/255, green: 35/255, blue: 23/255, alpha: 1)

  init(title: String, traits: UITraitCollection) {
    let label = UILabel()
    label.text = title
    label.font = UIFontMetrics(forTextStyle: .caption1)
      .scaledFont(for: Self.font, maximumPointSize: 18, compatibleWith: traits)
    label.textColor = Self.ink
    label.lineBreakMode = .byTruncatingTail
    let width = min(150, ceil(label.intrinsicContentSize.width) + 12)
    let height = ceil(label.font.lineHeight) + 6
    super.init(frame: CGRect(x: 0, y: 0, width: width, height: height))
    backgroundColor = UIColor(red: 255/255, green: 249/255, blue: 234/255, alpha: 1)
    layer.cornerRadius = height / 2
    layer.borderColor = Self.ink.withAlphaComponent(0.16).cgColor
    layer.borderWidth = 0.5
    label.frame = bounds.insetBy(dx: 6, dy: 0)
    addSubview(label)
  }

  required init?(coder: NSCoder) { nil }
}

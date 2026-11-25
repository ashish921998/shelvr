import MapKit

final class PlaceAnnotationView: MKAnnotationView {
  static let placeIdentifier = "shelvr-place"
  private static let ink = UIColor(red: 45/255, green: 35/255, blue: 23/255, alpha: 1)
  private static let paper = UIColor(red: 255/255, green: 249/255, blue: 234/255, alpha: 1)
  private static let amber = UIColor(red: 225/255, green: 165/255, blue: 65/255, alpha: 1)
  private static let discoverPaper = UIColor(red: 245/255, green: 248/255, blue: 247/255, alpha: 1)
  private static let discoverRim = UIColor(red: 125/255, green: 147/255, blue: 140/255, alpha: 1)

  private let disc = UIView()
  private let glyph = UILabel()
  private let symbol = UIImageView()
  private let check = UIImageView()

  override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
    frame.size = CGSize(width: 34, height: 34)
    collisionMode = .circle
    isAccessibilityElement = true
    accessibilityTraits = .button
    disc.isUserInteractionEnabled = false
    disc.layer.shadowColor = Self.ink.cgColor
    disc.layer.shadowOpacity = 0.18
    disc.layer.shadowRadius = 3
    disc.layer.shadowOffset = CGSize(width: 0, height: 2)
    glyph.textAlignment = .center
    glyph.adjustsFontSizeToFitWidth = true
    glyph.minimumScaleFactor = 0.6
    glyph.textColor = Self.ink
    symbol.contentMode = .center
    check.contentMode = .center
    check.image = UIImage(systemName: "checkmark",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 7, weight: .heavy))
    check.tintColor = Self.paper
    check.backgroundColor = Self.ink
    check.layer.cornerRadius = 7
    check.layer.borderWidth = 1
    check.layer.borderColor = Self.paper.cgColor
    addSubview(disc)
    disc.addSubview(glyph)
    disc.addSubview(symbol)
    addSubview(check)
  }

  required init?(coder: NSCoder) { nil }

  private func badge(diameter: CGFloat, fill: UIColor, rim: UIColor, border: CGFloat) {
    disc.bounds = CGRect(x: 0, y: 0, width: diameter, height: diameter)
    disc.center = CGPoint(x: bounds.midX, y: bounds.midY)
    disc.backgroundColor = fill
    disc.layer.cornerRadius = diameter / 2
    disc.layer.borderWidth = border
    disc.layer.borderColor = rim.cgColor
    disc.layer.shadowPath = UIBezierPath(ovalIn: disc.bounds).cgPath
    glyph.frame = disc.bounds.insetBy(dx: 3, dy: 2)
    symbol.frame = disc.bounds
    check.frame = CGRect(x: disc.frame.maxX - 10, y: disc.frame.minY - 1, width: 14, height: 14)
  }

  func showPlace(emoji: String?, saved: Bool, visited: Bool, title: String, status: String) {
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = "places"
    badge(diameter: saved ? 31 : 24, fill: saved ? Self.paper : Self.discoverPaper,
      rim: saved ? Self.amber : Self.discoverRim, border: saved ? 1.5 : 1)
    glyph.font = .systemFont(ofSize: saved ? 17 : 13)
    glyph.textColor = Self.ink
    glyph.text = emoji
    glyph.isHidden = emoji == nil
    symbol.isHidden = emoji != nil
    symbol.tintColor = saved ? Self.ink : Self.discoverRim
    symbol.image = UIImage(systemName: saved ? "bookmark.fill" : "mappin",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
    check.isHidden = !visited
    accessibilityLabel = title
    accessibilityValue = status
  }

  func showCluster(count: Int, label: String, status: String, saved: Bool) {
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = nil
    badge(diameter: 32, fill: Self.ink, rim: saved ? Self.amber : Self.discoverPaper, border: 2)
    glyph.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
    glyph.textColor = Self.paper
    glyph.text = count.formatted()
    glyph.isHidden = false
    symbol.isHidden = true
    check.isHidden = true
    accessibilityLabel = label
    accessibilityValue = status
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    bounds.insetBy(dx: -5, dy: -5).contains(point)
  }
}

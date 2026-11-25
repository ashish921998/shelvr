import MapKit
import ShelvrKit

final class PlaceAnnotationView: MKAnnotationView {
  static let placeIdentifier = "shelvr-place"
  private static let ink = UIColor(red: 45/255, green: 35/255, blue: 23/255, alpha: 1)
  private static let paper = UIColor(red: 255/255, green: 249/255, blue: 234/255, alpha: 1)
  private static let amber = UIColor(red: 225/255, green: 165/255, blue: 65/255, alpha: 1)
  private static let discoverPaper = UIColor(red: 245/255, green: 248/255, blue: 247/255, alpha: 1)
  private static let discoverRim = UIColor(red: 125/255, green: 147/255, blue: 140/255, alpha: 1)

  private let disc = UIView()
  private let glyph = UILabel()
  private let backPin = UIImageView()
  private let symbol = UIImageView()
  private let check = UIImageView()
  private var copy: Copy?

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
    backPin.contentMode = .center
    backPin.image = UIImage(systemName: "mappin",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .semibold))
    backPin.tintColor = Self.paper.withAlphaComponent(0.6)
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
    disc.addSubview(backPin)
    disc.addSubview(symbol)
    addSubview(check)
  }

  required init?(coder: NSCoder) { nil }

  func configure(copy: Copy) {
    self.copy = copy
    updatePresentation()
  }

  override func prepareForDisplay() {
    super.prepareForDisplay()
    updatePresentation()
  }

  private func updatePresentation() {
    guard let copy else { return }
    if let pin = annotation as? MapCanvas.Pin {
      let source = copy(pin.place.isSaved ? "share.savedFragment" : "tripPlanner.badgeSuggested")
      let status = pin.visited ? source + ", " + copy("passport.wentNoDate") : source
      showPlace(emoji: pin.place.emoji, saved: pin.place.isSaved, visited: pin.visited,
        title: pin.place.name, status: status)
    } else if let cluster = annotation as? MKClusterAnnotation {
      let count = cluster.memberAnnotations.count
      let savedCount = cluster.memberAnnotations.count { ($0 as? MapCanvas.Pin)?.place.isSaved == true }
      let status = savedCount == 0 ? copy("tripPlanner.badgeSuggested") :
        copy("share.savedFragment") + ": " + savedCount.formatted()
      showCluster(count: count, label: copy("passport.placesCount", count: count), status: status, saved: savedCount > 0)
    }
  }

  private func badge(width: CGFloat, height: CGFloat, fill: UIColor, rim: UIColor, border: CGFloat) {
    disc.bounds = CGRect(x: 0, y: 0, width: width, height: height)
    disc.center = CGPoint(x: bounds.midX, y: bounds.midY)
    disc.backgroundColor = fill
    disc.layer.cornerRadius = height / 2
    disc.layer.borderWidth = border
    disc.layer.borderColor = rim.cgColor
    disc.layer.shadowPath = UIBezierPath(roundedRect: disc.bounds, cornerRadius: height / 2).cgPath
    glyph.frame = disc.bounds.insetBy(dx: 3, dy: 2)
    symbol.frame = disc.bounds
    check.frame = CGRect(x: disc.frame.maxX - 10, y: disc.frame.minY - 1, width: 14, height: 14)
  }

  private func showPlace(emoji: String?, saved: Bool, visited: Bool, title: String, status: String) {
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = "places"
    bounds.size = CGSize(width: 34, height: 34)
    collisionMode = .circle
    let diameter: CGFloat = saved ? 31 : 24
    badge(width: diameter, height: diameter, fill: saved ? Self.paper : Self.discoverPaper,
      rim: saved ? Self.amber : Self.discoverRim, border: saved ? 1.5 : 1)
    glyph.font = .systemFont(ofSize: saved ? 17 : 13)
    glyph.textColor = Self.ink
    glyph.text = emoji
    glyph.isHidden = emoji == nil
    backPin.isHidden = true
    symbol.isHidden = emoji != nil
    symbol.tintColor = saved ? Self.ink : Self.discoverRim
    symbol.image = UIImage(systemName: saved ? "bookmark.fill" : "mappin",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
    check.isHidden = !visited
    accessibilityLabel = title
    accessibilityValue = status
  }

  private func showCluster(count: Int, label: String, status: String, saved: Bool) {
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = nil
    glyph.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
    glyph.textColor = Self.paper
    glyph.text = count.formatted()
    glyph.isHidden = false
    let countWidth = ceil(glyph.intrinsicContentSize.width)
    let width = max(47, countWidth + 38)
    bounds.size = CGSize(width: width, height: 34)
    collisionMode = .rectangle
    badge(width: width, height: 30, fill: Self.ink, rim: saved ? Self.amber : Self.discoverPaper, border: 2)
    let contentX = (width - countWidth - 23) / 2
    glyph.frame = CGRect(x: contentX + 23, y: 0, width: countWidth, height: 30)
    backPin.frame = CGRect(x: contentX, y: 5, width: 10, height: 16)
    backPin.isHidden = false
    symbol.frame = CGRect(x: contentX + 6, y: 6, width: 14, height: 19)
    symbol.image = UIImage(systemName: "mappin.and.ellipse",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
    symbol.tintColor = Self.paper
    symbol.isHidden = false
    check.isHidden = true
    accessibilityLabel = label
    accessibilityValue = status
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    bounds.insetBy(dx: -5, dy: -5).contains(point)
  }
}

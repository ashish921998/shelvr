import MapKit
import ShelvrKit

final class PlaceAnnotationView: MKAnnotationView {
  static let placeIdentifier = "shelvr-place"
  private static let ink = UIColor(red: 45/255, green: 35/255, blue: 23/255, alpha: 1)
  private static let paper = UIColor(red: 255/255, green: 249/255, blue: 234/255, alpha: 1)
  private static let discoverPaper = UIColor(red: 245/255, green: 248/255, blue: 247/255, alpha: 1)
  private static let discoverRim = UIColor(red: 125/255, green: 147/255, blue: 140/255, alpha: 1)

  private let rearDot = UIView()
  private let disc = UIView()
  private let glyph = UILabel()
  private let symbol = UIImageView()
  private let check = UIImageView()
  private var copy: Copy?
  private var compact = false

  override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
    frame.size = CGSize(width: 34, height: 34)
    collisionMode = .circle
    isAccessibilityElement = true
    accessibilityTraits = .button
    rearDot.isUserInteractionEnabled = false
    rearDot.isHidden = true
    rearDot.layer.borderWidth = 1.5
    rearDot.layer.borderColor = Self.paper.cgColor
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
    addSubview(rearDot)
    addSubview(disc)
    disc.addSubview(glyph)
    disc.addSubview(symbol)
    addSubview(check)

  }

  required init?(coder: NSCoder) { nil }

  func configure(copy: Copy, compact: Bool) {
    self.copy = copy
    self.compact = compact
    updatePresentation()
  }

  override func prepareForDisplay() {
    super.prepareForDisplay()
    updatePresentation()
  }

  private func updatePresentation() {
    guard let copy else { return }
    if let pin = annotation as? MapCanvas.Pin {
      let kind = MapPinPalette.primaryKind(for: pin.place)
      let source = copy(pin.place.isSaved ? "share.savedFragment" : "tripPlanner.badgeSuggested")
      let category = kind.map { copy($0.labelKey) }
      let visit = pin.visited ? copy("passport.wentNoDate") : nil
      let status = [source, category, visit].compactMap { $0 }.joined(separator: ", ")
      showPlace(emoji: pin.place.emoji, saved: pin.place.isSaved, visited: pin.visited,
        title: pin.place.name, status: status, color: color(for: kind, saved: pin.place.isSaved))
    } else if let cluster = annotation as? MKClusterAnnotation {
      let count = cluster.memberAnnotations.count
      let members = cluster.memberAnnotations.compactMap { ($0 as? MapCanvas.Pin)?.place }
      let savedCount = members.count { $0.isSaved }
      let status = savedCount == 0 ? copy("tripPlanner.badgeSuggested") :
        copy("share.savedFragment") + ": " + savedCount.formatted()
      let colors = members.sorted {
        $0.isSaved == $1.isSaved ? $0.id < $1.id : $0.isSaved
      }.prefix(2).map { color(for: MapPinPalette.primaryKind(for: $0), saved: $0.isSaved) }
      let front = colors.first ?? Self.discoverRim
      showCluster(label: copy("passport.placesCount", count: count), status: status, saved: savedCount > 0,
        front: front, rear: colors.last ?? front)
    }
  }

  private func color(for kind: PlaceKind?, saved: Bool) -> UIColor {
    kind == nil && !saved ? Self.discoverRim : MapPinPalette.color(for: kind)
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

  private func showPlace(emoji: String?, saved: Bool, visited: Bool, title: String, status: String, color: UIColor) {
    rearDot.isHidden = true
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = "places"
    collisionMode = .circle
    let accent = saved ? color : color.withAlphaComponent(0.66)
    if compact {
      bounds.size = CGSize(width: 15, height: 15)
      let diameter: CGFloat = saved ? 12 : 9
      badge(width: diameter, height: diameter, fill: accent,
        rim: Self.paper, border: 1.5)
      glyph.isHidden = true
      symbol.isHidden = true
      check.frame = bounds
      check.backgroundColor = .clear
      check.layer.borderWidth = 0
      check.isHidden = !visited
    } else {
      bounds.size = CGSize(width: 34, height: 34)
      let diameter: CGFloat = saved ? 31 : 24
      badge(width: diameter, height: diameter, fill: saved ? Self.paper : Self.discoverPaper,
        rim: accent, border: saved ? 1.5 : 1)
      glyph.font = .systemFont(ofSize: saved ? 17 : 13)
      glyph.textColor = Self.ink
      glyph.text = emoji
      glyph.isHidden = emoji == nil
      symbol.isHidden = emoji != nil
      symbol.tintColor = saved ? Self.ink : Self.discoverRim
      symbol.image = UIImage(systemName: saved ? "bookmark.fill" : "mappin",
        withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
      check.backgroundColor = Self.ink
      check.layer.borderWidth = 1
      check.isHidden = !visited
    }
    accessibilityLabel = title
    accessibilityValue = status
  }

  private func showCluster(label: String, status: String, saved: Bool, front: UIColor, rear: UIColor) {
    displayPriority = saved ? .defaultHigh : .defaultLow
    clusteringIdentifier = nil
    collisionMode = .circle
    let frontSize: CGFloat = compact ? 15 : 20
    let rearSize: CGFloat = compact ? 13 : 17
    let offset: CGFloat = compact ? 4 : 5
    bounds.size = CGSize(width: frontSize + 2 * offset + 2, height: frontSize + 2 * offset + 2)
    badge(width: frontSize, height: frontSize, fill: front, rim: Self.paper, border: 1.5)
    disc.center = CGPoint(x: bounds.midX + offset, y: bounds.midY + offset * 0.75)
    rearDot.bounds = CGRect(x: 0, y: 0, width: rearSize, height: rearSize)
    rearDot.center = CGPoint(x: bounds.midX - offset, y: bounds.midY - offset * 0.75)
    rearDot.backgroundColor = rear
    rearDot.layer.cornerRadius = rearSize / 2
    rearDot.isHidden = false
    glyph.isHidden = true
    symbol.isHidden = true
    check.isHidden = true
    accessibilityLabel = label
    accessibilityValue = status
  }

  var pinHitBounds: CGRect {
    let horizontal = max(0, (44 - bounds.width) / 2)
    let vertical = max(0, (44 - bounds.height) / 2)
    return bounds.insetBy(dx: -horizontal, dy: -vertical)
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    pinHitBounds.contains(point)
  }
}

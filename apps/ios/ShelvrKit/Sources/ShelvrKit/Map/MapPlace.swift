import Combine
import ConvexMobile
import Foundation

public struct MapPlace: Decodable, Hashable, Identifiable, Sendable {
  public let _id, itemId, appleId, city, category, cuisine: String?
  public let name: String
  public let lat, lng: Double
  public let kinds: [String]
  public let features: [String]?

  public var id: String {
    if let _id { return "discover:\(_id)" }
    if let appleId { return "saved-apple:\(appleId)" }
    return "\(itemId ?? ""):\(name):\(lat):\(lng)"
  }

  public var isSaved: Bool { itemId != nil }

  static func words(_ name: String) -> [String] {
    let scalars = name.decomposedStringWithCompatibilityMapping.unicodeScalars.filter {
      !CharacterSet.nonBaseCharacters.contains($0)
    }
    let normalized = String(scalars).lowercased().replacing(/['’ʼ]/, with: "")
    return normalized.unicodeScalars.split(whereSeparator: { !letterOrNumber($0) }).map(String.init)
  }

  static func key(_ name: String) -> String {
    let trimmed = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    let clipped = trimmed.utf16.count > 80 ? String(decoding: trimmed.utf16.prefix(79), as: UTF16.self) : trimmed
    let scalars = clipped.decomposedStringWithCompatibilityMapping.unicodeScalars.filter {
      !CharacterSet.nonBaseCharacters.contains($0)
    }
    return String(String(scalars).lowercased().unicodeScalars.filter(letterOrNumber))
  }

  private static func letterOrNumber(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
      .decimalNumber, .letterNumber, .otherNumber: true
    default: false
    }
  }

  public static func openingPins(saved: [Self]?, discover: [Self], visible: [Self], filtered: Bool) -> [Self]? {
    guard let saved else { return nil }
    if filtered { return visible.isEmpty ? nil : visible }
    let anchors = saved.isEmpty ? discover : saved
    guard !anchors.isEmpty else { return nil }
    let groups = Dictionary(grouping: anchors) { ($0.city ?? "").lowercased() }
    let city = anchors.compactMap { $0.city?.lowercased() }.filter { !$0.isEmpty }.max {
      groups[$0, default: []].count < groups[$1, default: []].count
    }
    return city.flatMap { groups[$0] } ?? anchors
  }

  static func km(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let r = Double.pi / 180
    let h = pow(sin((lat2 - lat1) * r / 2), 2) +
      cos(lat1 * r) * cos(lat2 * r) * pow(sin((lng2 - lng1) * r / 2), 2)
    return 12742 * asin(min(1, sqrt(h)))
  }

  private func isNamesake(of place: MapPlace) -> Bool {
    guard Self.km(lat, lng, place.lat, place.lng) <= 0.3 else { return false }
    if Self.key(name) == Self.key(place.name) { return true }
    let a = Self.words(name), b = Self.words(place.name)
    let (short, long) = a.count <= b.count ? (a, b) : (b, a)
    guard !short.isEmpty else { return false }
    return (0...(long.count - short.count)).contains {
      long[$0..<($0 + short.count)].elementsEqual(short)
    }
  }

  public static func combined(saved: [Self], discover: [Self]) -> [Self] {
    let appleIDs = Set(saved.compactMap(\.appleId))
    let bands = Dictionary(grouping: saved) { Int(floor($0.lat * 100)) }
    return saved + discover.filter { place in
      if let id = place.appleId, appleIDs.contains(id) { return false }
      let band = Int(floor(place.lat * 100))
      return !(band - 1...band + 1).contains { k in
        bands[k]?.contains { $0.isNamesake(of: place) } == true
      }
    }
  }

  public static func search(_ entries: [Self], query: String) -> [Self] {
    func folded(_ text: String) -> String {
      text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    }
    let words = folded(query).split(whereSeparator: \.isWhitespace)
    guard !words.isEmpty else { return entries }
    let phrase = words.joined(separator: " ")
    var groups = Array(repeating: [Self](), count: 4)
    for place in entries {
      let text = folded(([place.name, place.city ?? ""] + (place.features ?? [])).joined(separator: " "))
      guard words.allSatisfy({ text.contains($0) }) else { continue }
      let group = (place.isSaved ? 0 : 2) + (folded(place.name).hasPrefix(phrase) ? 0 : 1)
      groups[group].append(place)
    }
    return groups.flatMap { $0 }
  }

  public static let kindOrder = ["food", "coffee", "dessert", "drinks", "dateNight", "activities", "shopping"]

  public static func filterKinds(_ places: [Self], selected: Set<String>) -> [String] {
    var counts: [String: Int] = [:]
    for place in places {
      for kind in Set(place.kinds) { counts[kind, default: 0] += 1 }
    }
    return kindOrder.filter { counts[$0, default: 0] >= 3 || selected.contains($0) }
      .sorted { counts[$0, default: 0] > counts[$1, default: 0] }
  }
}

extension DiscoverBox: ConvexEncodable {}

extension Backend {
  public struct AreaPlaces: Decodable { public let places: [MapPlace]; public let complete: Bool }

  public func discover(in box: DiscoverBox) -> some AsyncSequence<AreaPlaces, any Error> {
    client.subscribe(to: "places:inArea", with: ["box": box], yielding: AreaPlaces.self).values
  }
}

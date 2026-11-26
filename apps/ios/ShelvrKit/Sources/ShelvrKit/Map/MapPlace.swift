import Combine
import ConvexMobile
import Foundation

public enum PlaceKind: String, CaseIterable, Sendable {
  case food, coffee, dessert, drinks, dateNight, activities, shopping, stay

  public var labelKey: String {
    switch self {
    case .food: "map.kindFood"
    case .coffee: "map.kindCoffee"
    case .dessert: "map.kindDessert"
    case .drinks: "map.kindDrinks"
    case .dateNight: "map.kindDateNight"
    case .activities: "map.kindActivities"
    case .shopping: "map.kindShopping"
    case .stay: "map.kindStay"
    }
  }
}

public struct MapPlace: Hashable, Identifiable, Sendable {
  public enum Source: Hashable, Sendable {
    case saved(itemID: String)
    case discover(placeID: String, features: [String])
  }

  public let source: Source
  public let name: String
  public let lat, lng: Double
  public let appleId, city, category, cuisine: String?
  public let kinds: [PlaceKind]

  public var id: String {
    switch source {
    case let .saved(itemID):
      if let appleId { return "saved-apple:\(appleId)" }
      return "\(itemID):\(name):\(lat):\(lng)"
    case let .discover(placeID, _): return "discover:\(placeID)"
    }
  }

  public var isSaved: Bool {
    if case .saved = source { return true }
    return false
  }

  private var features: [String] {
    if case let .discover(_, features) = source { return features }
    return []
  }

  struct SavedRow: Decodable {
    let itemId, name: String
    let lat, lng: Double
    let appleId, city, category, cuisine: String?
    let kinds: [String]

    var place: MapPlace {
      MapPlace(source: .saved(itemID: itemId), name: name, lat: lat, lng: lng, appleId: appleId,
        city: city, category: category, cuisine: cuisine, kinds: kinds.compactMap(PlaceKind.init(rawValue:)))
    }
  }

  struct DiscoverRow: Decodable {
    let _id, name, appleId, city: String
    let lat, lng: Double
    let category, cuisine: String?
    let kinds: [String]
    let features: [String]?

    var place: MapPlace {
      MapPlace(source: .discover(placeID: _id, features: features ?? []), name: name, lat: lat, lng: lng,
        appleId: appleId, city: city, category: category, cuisine: cuisine, kinds: kinds.compactMap(PlaceKind.init(rawValue:)))
    }
  }

  struct CatalogRow: Decodable {
    let _id, name, city: String
    let lat, lng: Double
    let appleId, category, cuisine, source: String?
    let kinds: [String]
    let features: [String]?

    var place: MapPlace {
      MapPlace(source: .discover(placeID: _id, features: features ?? []), name: name, lat: lat, lng: lng,
        appleId: appleId, city: city, category: category, cuisine: cuisine, kinds: kinds.compactMap(PlaceKind.init(rawValue:)))
    }
  }

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

  static func search(_ local: [Self], catalog: [Self], query: String) -> [Self] {
    let nearby = search(local, query: query)
    guard !catalog.isEmpty else { return nearby }
    let personal = local.filter(\.isSaved)
    let shared = local.filter { !$0.isSaved } + catalog.filter { $0.appleId != nil }
    let indexed = catalog.map { hit in
      hit.catalogRepresentative(in: personal) ?? hit.catalogRepresentative(in: shared) ?? hit
    }
    let found = nearby.filter(\.isSaved) + indexed + nearby.filter { !$0.isSaved }
    var ids = Set<String>()
    return (found.filter(\.isSaved) + found.filter { !$0.isSaved }).filter { ids.insert($0.id).inserted }
  }

  private func catalogRepresentative(in candidates: [Self]) -> Self? {
    candidates.first { $0.id == id || (appleId != nil && $0.appleId == appleId) } ??
      candidates.first { $0.isNearbyCatalogVenue(self) }
  }

  private func isNearbyCatalogVenue(_ other: Self) -> Bool {
    guard (isSaved || appleId != nil), appleId == nil || other.appleId == nil,
      let city, let otherCity = other.city, Self.key(city) == Self.key(otherCity),
      Self.key(name) == Self.key(other.name)
    else { return false }
    return Self.km(lat, lng, other.lat, other.lng) <= 0.025
  }

  public enum LabelPriority: Int {
    case selected, exactMatch, saved
  }

  public func labelPriority(selectedID: String?, query: String) -> LabelPriority? {
    if id == selectedID { return .selected }
    let terms = Self.folded(query).split(whereSeparator: \.isWhitespace)
    if !terms.isEmpty, terms == Self.folded(name).split(whereSeparator: \.isWhitespace) { return .exactMatch }
    return isSaved ? .saved : nil
  }

  private static func folded(_ text: String) -> String {
    let unmarked = text.decomposedStringWithCanonicalMapping.unicodeScalars.filter { scalar in
      switch scalar.properties.generalCategory {
      case .nonspacingMark, .spacingMark, .enclosingMark: false
      default: true
      }
    }
    return String(unmarked).lowercased(with: Locale(identifier: "und"))
  }

  public static func search(_ entries: [Self], query: String) -> [Self] {
    let words = folded(query).split(whereSeparator: \.isWhitespace)
    guard !words.isEmpty else {
      return query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? entries : []
    }
    let phrase = words.joined(separator: " ")
    var groups = Array(repeating: [Self](), count: 4)
    for place in entries {
      let text = folded(([place.name, place.city ?? ""] + place.features).joined(separator: " "))
      guard words.allSatisfy({ text.range(of: $0, options: .literal) != nil }) else { continue }
      let startsWithQuery = folded(place.name).range(of: phrase, options: [.literal, .anchored]) != nil
      let group = (place.isSaved ? 0 : 2) + (startsWithQuery ? 0 : 1)
      groups[group].append(place)
    }
    return groups.flatMap { $0 }
  }
}

extension DiscoverBox: ConvexEncodable {}

extension Backend {
  public struct AreaPlaces: Sendable {
    public let places: [MapPlace]
    public let complete: Bool
  }

  public struct CatalogPlaces: Sendable {
    public let places: [MapPlace]
    public let includesOverture: Bool
  }

  private struct AreaRows: Decodable {
    let places: [MapPlace.DiscoverRow]
    let complete: Bool
  }

  public func savedMapPlaces() -> some AsyncSequence<[MapPlace], any Error> {
    query("mapPlaces:listMapPlaces", as: [MapPlace.SavedRow].self).map { $0.map(\.place) }
  }

  public func discover(in box: DiscoverBox) -> some AsyncSequence<AreaPlaces, any Error> {
    client.subscribe(to: "places:inArea", with: ["box": box], yielding: AreaRows.self).values
      .map { AreaPlaces(places: $0.places.map(\.place), complete: $0.complete) }
  }

  public func catalogPlaces(matching text: String) -> some AsyncSequence<CatalogPlaces, any Error> {
    query("places:searchCatalog", with: ["text": text], as: [MapPlace.CatalogRow].self)
      .map { CatalogPlaces(places: $0.map(\.place), includesOverture: $0.contains { $0.source == "overture" }) }
  }
}

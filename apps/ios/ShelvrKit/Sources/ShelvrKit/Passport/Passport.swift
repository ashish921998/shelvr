import Foundation

public struct PassportStamp: Decodable, Identifiable, Sendable {
  public let key, name: String
  public let itemId, listPlaceId, city, countryCode, source, cover: String?
  public let lat, lng: Double?
  public let visitedAt: Double
  public let backfilled: Bool?
  public var id: String { "\(key):\(lat.map { String($0) } ?? ""):\(lng.map { String($0) } ?? "")" }
  public var date: Date? { backfilled == true ? nil : Date(timeIntervalSince1970: visitedAt / 1000) }
}

public struct PassportCityStamp: Decodable, Identifiable, Sendable {
  public let city, country: String
  public let stampedAt: Double
  public var id: String { city }
}

public struct PassportCompletion: Decodable, Sendable {
  public let city: String
  public let stamped, total: Int
}

public struct PassportSection: Identifiable, Sendable {
  public let id: String
  public let city: String?
  public let places: [PassportStamp]
  public let completion: PassportCompletion?
  public var cityStamp: StampCity?
  public var cardPlaces: ArraySlice<PassportStamp> { places.prefix(6) }
  public var sourceLabel: String {
    let sources = Set(places.compactMap(\.source))
    if sources.contains("instagram") && sources.contains("tiktok") { return "passport.cardSavedBoth" }
    if sources.contains("instagram") { return "passport.cardSavedInstagram" }
    if sources.contains("tiktok") { return "passport.cardSavedTiktok" }
    return "passport.cardSavedElsewhere"
  }
  public var month: Date? { places.lazy.compactMap(\.date).first }

  public static func cityKey(_ city: String?) -> String {
    (city ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
  }

  public static func sections(stamps: [PassportStamp], completion: [PassportCompletion]) -> [Self] {
    var order: [String] = []
    var groups: [String: [PassportStamp]] = [:]
    for stamp in stamps {
      let key = cityKey(stamp.city)
      if groups[key] == nil, !key.isEmpty { order.append(key) }
      groups[key, default: []].append(stamp)
    }
    let totals = Dictionary(completion.map { (cityKey($0.city), $0) }, uniquingKeysWith: { _, last in last })
    for row in completion where row.stamped > 0 && groups[cityKey(row.city)] == nil {
      order.append(cityKey(row.city))
    }
    if groups[""] != nil { order.append("") }
    for row in completion where row.stamped == 0 && groups[cityKey(row.city)] == nil {
      order.append(cityKey(row.city))
    }
    return order.map { key in
      let places = groups[key] ?? [], row = totals[key]
      return Self(id: key, city: row?.city ?? places.first?.city, places: places, completion: row)
    }
  }
}

public struct PassportPages: Sendable {
  public var sections: [PassportSection]
  public var standalone: [StampCity]

  public init(stamps: [PassportStamp], completion: [PassportCompletion], cities: [PassportCityStamp]) {
    var sections = PassportSection.sections(stamps: stamps, completion: completion)
    var standalone: [StampCity] = []
    var seen = Set<String>()
    for stamp in cities {
      guard seen.insert(stamp.city).inserted,
        let city = StampCity.catalog.first(where: { $0.id == stamp.city }) else { continue }
      let names = Set(city.names.map { PassportSection.cityKey($0) })
      let index = sections.firstIndex { section in
        guard section.cityStamp == nil, names.contains(section.id),
          !section.places.isEmpty || (section.completion?.stamped ?? 0) > 0 else { return false }
        return section.places.isEmpty || section.places.contains {
          $0.countryCode == nil || $0.countryCode == stamp.country
        }
      }
      if let index { sections[index].cityStamp = city } else { standalone.append(city) }
    }
    self.sections = sections
    self.standalone = standalone
  }
}

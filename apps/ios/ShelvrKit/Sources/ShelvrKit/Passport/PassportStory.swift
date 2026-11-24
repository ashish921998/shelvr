import Foundation

public struct PassportStory: Sendable {
  public let places, cities, countries: Int
  public let fromReels: Bool
  public let cityNames: [String]
  public let photos: [PassportStamp]
  public var more: Int { places - photos.count }

  public init(places: [PassportStamp], cities: [PassportCityStamp], label: (StampCity) -> String) {
    let totals = StampCity.counts(places: places, stamps: cities)
    self.places = places.count
    self.cities = totals.cities
    self.countries = totals.countries
    self.fromReels = places.contains { $0.source == "instagram" || $0.source == "tiktok" }
    photos = Array(places.filter { $0.cover != nil }.sorted {
      ($0.date?.timeIntervalSince1970 ?? 0) > ($1.date?.timeIntervalSince1970 ?? 0)
    }.prefix(4))
    let catalog = Dictionary(uniqueKeysWithValues: StampCity.catalog.map { ($0.id, $0) })
    let recent = cities.sorted { $0.stampedAt > $1.stampedAt }.prefix(2)
    var result: [String] = []
    var used: Set<String> = []
    for stamp in recent {
      let name = catalog[stamp.city].map(label) ?? stamp.city
      result.append(name)
      used.insert(PassportSection.cityKey(stamp.city))
      used.insert(PassportSection.cityKey(name))
    }
    var order: [String] = [], names: [String: String] = [:], counts: [String: Int] = [:]
    for place in places {
      guard let city = place.city, !city.isEmpty else { continue }
      let key = PassportSection.cityKey(city)
      guard !used.contains(key) else { continue }
      if counts[key] == nil { order.append(key); names[key] = city }
      counts[key, default: 0] += 1
    }
    for key in order.sorted(by: { counts[$0, default: 0] > counts[$1, default: 0] }) where result.count < 2 {
      if let name = names[key] { result.append(name) }
    }
    cityNames = result
  }
}

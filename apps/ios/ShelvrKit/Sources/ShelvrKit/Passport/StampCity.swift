import Foundation

public struct StampCity: Identifiable, Sendable {
  public let id, country: String
  let names: [String]
  public var labelKey: String { "tripTeaser.city" + id.split(separator: "-").map { $0.capitalized }.joined() }

  public static let catalog: [Self] = [
    Self(id: "amsterdam", country: "NL", names: ["Amsterdam"]),
    Self(id: "austin", country: "US", names: ["Austin"]),
    Self(id: "barcelona", country: "ES", names: ["Barcelona"]),
    Self(id: "berlin", country: "DE", names: ["Berlin"]),
    Self(id: "chicago", country: "US", names: ["Chicago"]),
    Self(id: "copenhagen", country: "DK", names: ["Copenhagen", "København"]),
    Self(id: "dallas", country: "US", names: ["Dallas"]),
    Self(id: "florence", country: "IT", names: ["Florence", "Firenze"]),
    Self(id: "las-vegas", country: "US", names: ["Las Vegas"]),
    Self(id: "lisbon", country: "PT", names: ["Lisbon", "Lisboa"]),
    Self(id: "london", country: "GB", names: ["London"]),
    Self(id: "los-angeles", country: "US", names: ["Los Angeles", "LA"]),
    Self(id: "madrid", country: "ES", names: ["Madrid"]),
    Self(id: "milan", country: "IT", names: ["Milan", "Milano"]),
    Self(id: "montreal", country: "CA", names: ["Montreal", "Montréal"]),
    Self(id: "new-york", country: "US", names: ["New York", "New York City", "NYC"]),
    Self(id: "paris", country: "FR", names: ["Paris"]),
    Self(id: "prague", country: "CZ", names: ["Prague", "Praha"]),
    Self(id: "rome", country: "IT", names: ["Rome", "Roma"]),
    Self(id: "san-francisco", country: "US", names: ["San Francisco", "SF"]),
    Self(id: "seattle", country: "US", names: ["Seattle"]),
    Self(id: "seoul", country: "KR", names: ["Seoul"]),
    Self(id: "tokyo", country: "JP", names: ["Tokyo"]),
    Self(id: "toronto", country: "CA", names: ["Toronto"]),
    Self(id: "vancouver", country: "CA", names: ["Vancouver"]),
  ]

  public static func counts(places: [PassportStamp], stamps: [PassportCityStamp]) -> (cities: Int, countries: Int) {
    let keys = Set(places.map { PassportSection.cityKey($0.city) }.filter { !$0.isEmpty })
    var countries = Set(places.compactMap(\.countryCode).filter { !$0.isEmpty })
    var cities = keys.count
    let stamped = Dictionary(stamps.map { ($0.city, $0.country) }, uniquingKeysWith: { first, _ in first })
    for city in catalog {
      guard let country = stamped[city.id] else { continue }
      countries.insert(country)
      let aliases = Set(city.names.map { PassportSection.cityKey($0) })
      if !places.contains(where: {
        aliases.contains(PassportSection.cityKey($0.city)) && ($0.countryCode == nil || $0.countryCode == country)
      }) { cities += 1 }
    }
    return (cities, countries.count)
  }
}

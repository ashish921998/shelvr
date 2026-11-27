import Foundation

public enum StampShape: String, CaseIterable, Sendable { case circle, octagon, arch, shield }

public struct StampLook: Hashable, Sendable {
  public let ink: Int
  public let shape: StampShape
}

public struct StampCity: Identifiable, Sendable {
  public let id, country: String
  let names: [String]
  public let look: StampLook
  public var labelKey: String { "tripTeaser.city" + id.split(separator: "-").map { $0.capitalized }.joined() }

  public static let catalog: [Self] = [
    Self(id: "amsterdam", country: "NL", names: ["Amsterdam"], look: StampLook(ink: 0, shape: .circle)),
    Self(id: "austin", country: "US", names: ["Austin"], look: StampLook(ink: 1, shape: .octagon)),
    Self(id: "barcelona", country: "ES", names: ["Barcelona"], look: StampLook(ink: 2, shape: .arch)),
    Self(id: "berlin", country: "DE", names: ["Berlin"], look: StampLook(ink: 3, shape: .shield)),
    Self(id: "chicago", country: "US", names: ["Chicago"], look: StampLook(ink: 4, shape: .circle)),
    Self(id: "copenhagen", country: "DK", names: ["Copenhagen", "København"], look: StampLook(ink: 5, shape: .octagon)),
    Self(id: "dallas", country: "US", names: ["Dallas"], look: StampLook(ink: 0, shape: .shield)),
    Self(id: "florence", country: "IT", names: ["Florence", "Firenze"], look: StampLook(ink: 1, shape: .circle)),
    Self(id: "las-vegas", country: "US", names: ["Las Vegas"], look: StampLook(ink: 2, shape: .octagon)),
    Self(id: "lisbon", country: "PT", names: ["Lisbon", "Lisboa"], look: StampLook(ink: 3, shape: .arch)),
    Self(id: "london", country: "GB", names: ["London"], look: StampLook(ink: 4, shape: .shield)),
    Self(id: "los-angeles", country: "US", names: ["Los Angeles", "LA"], look: StampLook(ink: 5, shape: .circle)),
    Self(id: "madrid", country: "ES", names: ["Madrid"], look: StampLook(ink: 0, shape: .arch)),
    Self(id: "milan", country: "IT", names: ["Milan", "Milano"], look: StampLook(ink: 3, shape: .octagon)),
    Self(id: "montreal", country: "CA", names: ["Montreal", "Montréal"], look: StampLook(ink: 2, shape: .circle)),
    Self(id: "new-york", country: "US", names: ["New York", "New York City", "NYC"], look: StampLook(ink: 1, shape: .shield)),
    Self(id: "paris", country: "FR", names: ["Paris"], look: StampLook(ink: 4, shape: .arch)),
    Self(id: "prague", country: "CZ", names: ["Prague", "Praha"], look: StampLook(ink: 5, shape: .shield)),
    Self(id: "rome", country: "IT", names: ["Rome", "Roma"], look: StampLook(ink: 2, shape: .shield)),
    Self(id: "san-francisco", country: "US", names: ["San Francisco", "SF"], look: StampLook(ink: 1, shape: .arch)),
    Self(id: "seattle", country: "US", names: ["Seattle"], look: StampLook(ink: 0, shape: .octagon)),
    Self(id: "seoul", country: "KR", names: ["Seoul"], look: StampLook(ink: 3, shape: .circle)),
    Self(id: "tokyo", country: "JP", names: ["Tokyo"], look: StampLook(ink: 4, shape: .octagon)),
    Self(id: "toronto", country: "CA", names: ["Toronto"], look: StampLook(ink: 5, shape: .arch)),
    Self(id: "vancouver", country: "CA", names: ["Vancouver"], look: StampLook(ink: 0, shape: .circle)),
  ]

  public static func counts<Place: PassportLocation>(places: [Place], stamps: [PassportCityStamp]) -> (cities: Int, countries: Int) {
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

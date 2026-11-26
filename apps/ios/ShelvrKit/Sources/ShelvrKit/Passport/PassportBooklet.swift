import Foundation

public enum PassportBooklet {
  public enum Page: Identifiable, Sendable {
    case cover
    case city(StampCity, stamped: Date)

    public var id: String {
      switch self {
      case .cover: "cover"
      case .city(let city, _): city.id
      }
    }
  }

  public static func pages(cities: [PassportCityStamp]) -> [Page] {
    var seen = Set<String>()
    let stamped = cities.sorted { $0.stampedAt < $1.stampedAt }.compactMap { stamp -> Page? in
      guard let city = StampCity.catalog.first(where: { $0.id == stamp.city }), seen.insert(city.id).inserted else { return nil }
      return .city(city, stamped: Date(timeIntervalSince1970: stamp.stampedAt / 1000))
    }
    return [.cover] + stamped
  }
}

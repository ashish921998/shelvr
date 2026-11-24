import Foundation

public protocol PassportLocation {
  var city: String? { get }
  var countryCode: String? { get }
}

extension PassportStamp: PassportLocation {}

public struct BadgeStamp: Decodable, PassportLocation {
  public let city, countryCode: String?
  public let kinds: [String]
}

public struct PassportBadge: Identifiable, Equatable, Sendable {
  public let id: String
  public let measure: String
  public let goal: Int

  public static let all: [Self] = [
    .init(id: "firstStamp", measure: "places", goal: 1),
    .init(id: "explorer", measure: "places", goal: 10),
    .init(id: "wanderer", measure: "places", goal: 50),
    .init(id: "globetrotter", measure: "places", goal: 150),
    .init(id: "cityHopper", measure: "cities", goal: 5),
    .init(id: "passportHolder", measure: "countries", goal: 3),
    .init(id: "completionist", measure: "completeCities", goal: 1),
    .init(id: "coffeeCrawler", measure: "coffee", goal: 5),
    .init(id: "foodie", measure: "food", goal: 15),
    .init(id: "sweetTooth", measure: "dessert", goal: 5),
    .init(id: "nightOwl", measure: "drinks", goal: 5),
    .init(id: "outAndAbout", measure: "activities", goal: 5),
  ]

  public struct Progress: Identifiable {
    public let badge: PassportBadge
    public let have: Int
    public var earned: Bool { have == badge.goal }
    public var id: String { badge.id }
  }

  public static func visible(stamps: [BadgeStamp], cities: [PassportCityStamp], completion: [PassportCompletion]) -> [Progress] {
    let counts = StampCity.counts(places: stamps, stamps: cities)
    var totals = ["places": stamps.count, "cities": counts.cities, "countries": counts.countries,
      "completeCities": completion.filter { $0.total > 0 && $0.stamped >= $0.total }.count]
    for stamp in stamps {
      for key in Set(stamp.kinds) where ["coffee", "food", "dessert", "drinks", "activities"].contains(key) {
        totals[key, default: 0] += 1
      }
    }
    let states = all.map { Progress(badge: $0, have: min(totals[$0.measure, default: 0], $0.goal)) }
    var seen = Set<String>(), next: Progress?
    for progress in states where !progress.earned && seen.insert(progress.badge.measure).inserted {
      if let current = next, progress.have * current.badge.goal <= current.have * progress.badge.goal { continue }
      next = progress
    }
    return states.filter(\.earned) + (next.map { [$0] } ?? [])
  }
}

public struct PassportEntitlement: Decodable {
  public let status: String
  public let expiresAt: Double?

  public func active(at date: Date) -> Bool {
    status == "lifetime" || (["trialing", "pro"].contains(status) && (expiresAt ?? 0) > date.timeIntervalSince1970 * 1000)
  }
}

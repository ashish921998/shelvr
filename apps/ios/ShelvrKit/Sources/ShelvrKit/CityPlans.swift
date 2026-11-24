import Combine
import ConvexMobile
import Foundation

public struct EveningStop: Decodable, Sendable {
  public let slot: String
  public let source: String
  public let itemId: String?
  public let name: String
  public let lat: Double
  public let lng: Double
  public let appleId: String?
  public let why: String?

  private var words: [Substring] {
    name.folding(options: [.diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .lowercased().filter { !"'’ʼ".contains($0) }.split { !$0.isLetter && !$0.isNumber }
  }

  func pairs(with other: Self) -> Bool {
    let distance = CityPlace.km(lat, lng, other.lat, other.lng)
    guard slot != other.slot, source != "suggested" || other.source != "suggested", distance <= 1.5 else { return false }
    if let appleId, let theirs = other.appleId { return appleId != theirs }
    if distance > 0.3 { return true }
    if CityPlace.key(name) == CityPlace.key(other.name) { return false }
    let (short, long) = words.count <= other.words.count ? (words, other.words) : (other.words, words)
    guard !short.isEmpty else { return true }
    return !(0...(long.count - short.count)).contains { index in long[index...].starts(with: short) }
  }
}

public struct Evening: Decodable, Equatable, Sendable {
  public var first: Int
  public var second: Int
}

public struct CityDate: Decodable, Sendable {
  public let status: String
  public let city: String
  public let kind: String
  public let stops: [EveningStop]
  public let evenings: [Evening]

  public func nextRound(_ tried: Set<Int>, from current: Int, to next: Int) -> Set<Int> {
    let shown = tried.union([current])
    return shown.contains(next) ? [] : shown
  }

  public func swap(_ evening: Evening, first: Bool, tried: Set<Int>) -> Evening? {
    let keptIndex = first ? evening.second : evening.first
    let currentIndex = first ? evening.first : evening.second
    guard stops.indices.contains(keptIndex) else { return nil }
    let kept = stops[keptIndex]
    let options = stops.indices.filter {
      $0 != currentIndex && stops[$0].slot == (first ? "first" : "second") && stops[$0].pairs(with: kept)
    }.sorted { a, b in
      let da = CityPlace.km(stops[a].lat, stops[a].lng, kept.lat, kept.lng)
      let db = CityPlace.km(stops[b].lat, stops[b].lng, kept.lat, kept.lng)
      return da == db ? a < b : da < db
    }
    guard let next = options.first(where: { !tried.contains($0) }) ?? options.first else { return nil }
    return Evening(first: first ? next : evening.first, second: first ? evening.second : next)
  }
}

public struct CityTrip: Decodable, Sendable {
  public struct Stop: Decodable, Identifiable, Sendable {
    public let _id: String
    public let name: String
    public let area: String?
    public let why: String?
    public let time: String?
    public let note: String?
    public let lat: Double
    public let lng: Double
    public var id: String { _id }
  }

  public let name: String?
  public let city: String
  public let days: [[Stop]]
  public let unplanned: [Stop]
}

extension Backend {
  public func planDate(city: String, kind: String, locale: String, listID: String? = nil) async throws -> CityDate {
    var args: [String: ConvexEncodable?] = ["city": city, "kind": kind, "locale": locale]
    if let listID { args["listId"] = listID }
    return try await client.action("datePlans:makeDatePlan", with: args)
  }

  public func planTrip(city: String, days: Int, pace: String, interests: [String], start: String?, stay: String, locale: String, listID: String?) async throws -> String? {
    struct Result: Decodable { let tripId: String? }
    var args: [String: ConvexEncodable?] = ["city": city, "days": Double(days), "pace": pace,
      "interests": interests.map { $0 as ConvexEncodable? }, "locale": locale]
    if let start { args["startDate"] = start }
    if !stay.isEmpty { args["stay"] = stay }
    if let listID { args["listId"] = listID }
    let result: Result = try await client.action("tripPlanner:createTripPlan", with: args)
    return result.tripId
  }

  public func cityTrip(_ id: String) -> some AsyncSequence<CityTrip?, any Error> {
    client.subscribe(to: "tripPlannerData:getTripPlan", with: ["tripId": id], yielding: CityTrip?.self).values
  }
}

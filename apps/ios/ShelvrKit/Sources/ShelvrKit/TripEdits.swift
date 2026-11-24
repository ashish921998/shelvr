import Combine
import ConvexMobile
import Foundation

public struct TripSavePlace: Decodable, Sendable {
  public let itemId: String
  public let name: String
}

public struct TripSearchPlace: Codable, ConvexEncodable, Sendable {
  public let name: String
  public let lat: Double
  public let lng: Double
  public let appleId: String?
  public let category: String?
  public let area: String?

  public init(name: String, lat: Double, lng: Double, appleId: String? = nil, category: String? = nil, area: String? = nil) {
    self.name = name; self.lat = lat; self.lng = lng
    self.appleId = appleId; self.category = category; self.area = area
  }
}

public struct TripMatches: Decodable, Sendable {
  public let available: Bool
  public let places: [TripSearchPlace]
}

public enum TripPlaceChoice: Sendable {
  case saved(TripSavePlace), search(TripSearchPlace)
}

public struct TripPosition: Decodable, Sendable {
  public let day: Int
  public let index: Int
}

public enum TripEdit {
  public static func day(_ requested: Int, count: Int) -> Int {
    (0...max(0, count)).contains(requested) ? requested : min(1, max(0, count))
  }

  public static func alreadyOnTrip(_ place: TripSearchPlace, trip: CityTrip) -> Bool {
    (trip.days.flatMap { $0 } + trip.unplanned).contains { stop in
      if let first = stop.appleId, let second = place.appleId { return first == second }
      guard CityPlace.km(stop.lat, stop.lng, place.lat, place.lng) <= 0.3 else { return false }
      if CityPlace.key(stop.name) == CityPlace.key(place.name) { return true }
      func words(_ name: String) -> [Substring] {
        name.folding(options: [.widthInsensitive, .diacriticInsensitive], locale: nil)
          .lowercased().filter { !"'’ʼ".contains($0) }.split { !$0.isLetter && !$0.isNumber }
      }
      let a = words(stop.name), b = words(place.name)
      let (short, long) = a.count <= b.count ? (a, b) : (b, a)
      return !short.isEmpty && (0...(long.count - short.count)).contains { long[$0...].starts(with: short) }
    }
  }

  public static func validTime(_ input: String) -> Bool {
    input.isEmpty || input.range(of: #"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"#, options: .regularExpression) != nil
  }
}

extension Backend {
  public func tripSavePlaces(_ id: String) -> some AsyncSequence<[TripSavePlace], any Error> {
    client.subscribe(to: "tripPlannerData:tripSavePlaces", with: ["tripId": id], yielding: [TripSavePlace].self).values
  }

  public func searchTripPlaces(_ id: String, query: String, locale: String) async throws -> TripMatches {
    try await client.action("tripPlanner:searchTripPlaces", with: ["tripId": id, "query": query, "locale": locale])
  }

  public func addTripStop(_ id: String, day: Int, choice: TripPlaceChoice) async throws {
    let place: [String: ConvexEncodable?]
    switch choice {
    case let .saved(value): place = ["kind": "save", "itemId": value.itemId, "name": value.name]
    case let .search(value): place = ["kind": "search", "place": value]
    }
    let _: String = try await client.mutation("tripPlannerData:addTripStop", with: ["tripId": id, "day": Double(day), "place": place])
  }

  public func moveTripStop(_ stop: String, day: Int, index: Int) async throws -> TripPosition {
    try await client.mutation("tripPlannerData:moveTripStop", with: ["stopId": stop, "day": Double(day), "index": Double(index)])
  }

  public func removeTripStop(_ stop: String) async throws -> TripPosition {
    try await client.mutation("tripPlannerData:removeTripStop", with: ["stopId": stop])
  }

  public func renameTrip(_ id: String, name: String) async throws {
    try await client.mutation("tripPlannerData:renameTripPlan", with: ["tripId": id, "name": name])
  }

  public func updateStop(_ stop: CityTrip.Stop, time: String, note: String) async throws {
    var args: [String: ConvexEncodable?] = ["stopId": stop.id]
    if time != (stop.time ?? "") { args.updateValue(time.isEmpty ? nil : time, forKey: "time") }
    if note != (stop.note ?? "") { args.updateValue(note.isEmpty ? nil : note, forKey: "note") }
    try await client.mutation("tripPlannerData:updateTripStopDetails", with: args)
  }
}

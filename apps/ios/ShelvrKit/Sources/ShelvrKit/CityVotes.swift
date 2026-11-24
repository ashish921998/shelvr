import Combine
import ConvexMobile
import Foundation

public struct CityVotes: Decodable, Sendable {
  public struct Place: Decodable, Identifiable, Sendable {
    public let key: String
    public let name: String
    public let itemId: String
    public let picks: Int
    public let passes: Int
    public var id: String { key }
  }

  public let token: String
  public let voters: Int
  public let expiresAt: Double
  public let places: [Place]

  public func isOpen(at date: Date) -> Bool { expiresAt > date.timeIntervalSince1970 * 1000 }

  public func match(_ pin: CityPlace, among pins: [CityPlace]) -> Place? {
    let key = CityPlace.key(pin.name)
    if let exact = places.first(where: { $0.itemId == pin.itemID && CityPlace.key($0.name) == key }) { return exact }
    guard pins.filter({ CityPlace.key($0.name) == key }).count == 1 else { return nil }
    return places.first { CityPlace.key($0.name) == key }
  }

  public static func unique(_ pins: [CityPlace]) -> [CityPlace] {
    var seen = Set<String>()
    return pins.filter { seen.insert($0.itemID + "\n" + CityPlace.key($0.name)).inserted }
  }

  public func sameSelection(_ selected: [CityPlace], among pins: [CityPlace]) -> Bool {
    let unique = Self.unique(selected)
    let keys = unique.compactMap { match($0, among: pins)?.key }
    return unique.count == places.count && Set(keys).count == unique.count
  }
}

extension Backend {
  public func cityVotes(_ city: String) -> some AsyncSequence<CityVotes?, any Error> {
    client.subscribe(to: "planShares:cityPlanVotes", with: ["city": city], yielding: CityVotes?.self).values
  }

  public func shareCityPlaces(city: String, selected: [CityPlace]) async throws -> String {
    let choices: [ConvexEncodable?] = CityVotes.unique(selected).map { pin in
      ["itemId": pin.itemID, "name": pin.name, "why": ""] as [String: ConvexEncodable?]
    }
    let space: String = try await client.mutation("spaces:ensureCitySpace", with: ["city": city])
    return try await client.mutation("planShares:createPlanShare", with: ["city": city, "spaceId": space, "places": choices])
  }
}

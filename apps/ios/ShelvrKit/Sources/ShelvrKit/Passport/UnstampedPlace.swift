import ConvexMobile
import Foundation

public struct UnstampedPlace: Decodable, Identifiable, Sendable {
  public struct Spot: Codable, ConvexEncodable, Sendable {
    let lat, lng: Double
    let appleId: String?
  }
  public struct ID: Hashable, Sendable {
    let item: String
    let name: String
    let lat, lng: Double
    let apple: String?
  }
  public let itemId, name, city: String
  public let spot: Spot
  public let cover: String?
  public var id: ID { ID(item: itemId, name: name, lat: spot.lat, lng: spot.lng, apple: spot.appleId) }

  var arguments: [String: ConvexEncodable?] { ["itemId": itemId, "name": name, "spot": spot] }
}

extension Backend {
  public func stampBefore(_ places: [UnstampedPlace]) async throws -> Int {
    let rows: [ConvexEncodable?] = places.map { $0.arguments as ConvexEncodable }
    return try await client.mutation("placeVisits:markVisitedBefore", with: ["places": rows])
  }

  public func stampNow(_ place: UnstampedPlace) async throws {
    try await client.mutation("placeVisits:setVisited",
      with: ["itemId": place.itemId, "name": place.name, "spot": place.spot, "visited": true])
  }
}

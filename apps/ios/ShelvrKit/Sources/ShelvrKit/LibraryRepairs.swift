import Combine
import ConvexMobile
import Foundation

public struct EditablePlace: Codable, Equatable, Sendable, ConvexEncodable {
  public let name: String
  public var city: String?
  public let lat: Double?
  public let lng: Double?
  public let appleId: String?
  public let category: String?
}

public struct SavePlaces: Decodable, Sendable {
  public let version: String
  public let ready: Bool
  public let places: [EditablePlace]
}

public struct PlaceMatches: Decodable, Sendable {
  public let available: Bool
  public let places: [EditablePlace]
}

extension LibrarySave {
  public func canRetry(at date: Date) -> Bool {
    if status == "processing" { return (processingStartedAt ?? _creationTime) < date.timeIntervalSince1970 * 1000 - 900_000 }
    if status == "failed" { return !["not_found", "image_too_large"].contains(failureReason) }
    return status == "ready" && enrichment == "partial"
  }
}

extension Backend {
  public func retrySave(_ id: String) async throws -> Bool {
    try await client.mutation("items:reprocessItem", with: ["id": id])
  }

  public func deleteSave(_ id: String) async throws {
    try await client.mutation("items:deleteItem", with: ["id": id])
  }

  public func placesForSave(_ id: String) -> some AsyncSequence<SavePlaces?, any Error> {
    client.subscribe(to: "placeCorrections:getPlaces", with: ["itemId": id], yielding: SavePlaces?.self).values
  }

  public func findPlace(_ query: String, city: String, id: String) async throws -> PlaceMatches {
    try await client.action("placeCorrectionSearch:search", with: ["itemId": id, "city": city, "query": query])
  }

  public func savePlaces(_ places: [EditablePlace], version: String, id: String) async throws {
    let values: [ConvexEncodable?] = places.map { $0 }
    try await client.mutation("placeCorrections:savePlaces", with: ["itemId": id, "version": version, "places": values])
  }
}

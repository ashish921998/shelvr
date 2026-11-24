import Foundation

public struct FriendPassport: Decodable {
  public struct City: Decodable {
    public let city: String?
    public let names: [String]
  }
  public let ownerName: String?
  public let places, cities: Int
  public let countries: Int?
  public let byCity: [City]
}

public struct PassportComparison: Decodable {
  public struct Place: Decodable {
    public let name: String
    public let city: String?
  }
  public let ownerName: String?
  public let both, onlyThem, onlyYou: [Place]
  public let toSave: Int
}

extension Backend {
  public struct SavedFriendPlaces: Decodable { public let saved, remaining: Int }

  public func saveFriendPlaces(token: String, note: String) async throws -> SavedFriendPlaces? {
    try await client.mutation("passportShares:saveFriendPlaces", with: ["token": token, "note": note])
  }
}

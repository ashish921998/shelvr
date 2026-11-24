import Combine
import ConvexMobile
import Foundation

public struct SharedListSummary: Decodable, Identifiable {
  public let _id, name: String
  public let placeCount, newCount: Int
  public let cities: [String]
  public var id: String { _id }
}

public struct ListInvite: Decodable {
  public let inviterName: String?
  public let name: String
  public let cities, placeNames: [String]
}

public struct SharedListDetail: Decodable {
  public struct Member: Decodable, Identifiable {
    public let userId: String
    public let firstName: String?
    public let isYou, isOwner: Bool
    public var id: String { userId }
  }

  public struct Place: Decodable, Identifiable {
    public struct Visitor: Decodable { public let isYou: Bool; public let firstName: String? }
    public let _id, name, city: String
    public let itemId, addedByName, appleId: String?
    public let lat, lng: Double?
    public let isNew: Bool
    public let visitedAt: Double?
    public let addedByYou: Bool
    public let wentBy: [Visitor]?
    public var id: String { _id }
    public var went: Bool { wentBy?.contains { $0.isYou } == true }
    public func matches(name candidate: String, lat: Double, lng: Double, apple: String?, item: String?) -> Bool {
      if let apple, let appleId { return apple == appleId }
      let key = CityPlace.key(name), next = CityPlace.key(candidate)
      if let item, itemId == item, key == next { return true }
      guard let a = self.lat, let b = self.lng else { return false }
      let r = Double.pi / 180
      let h = pow(sin((lat - a) * r / 2), 2) + cos(a * r) * cos(lat * r) * pow(sin((lng - b) * r / 2), 2)
      guard 12742 * asin(min(1, sqrt(h))) <= 0.3 else { return false }
      if key == next { return true }
      let words = Self.words(name), other = Self.words(candidate)
      let (short, long) = words.count <= other.count ? (words, other) : (other, words)
      guard !short.isEmpty else { return false }
      return (0...(long.count - short.count)).contains { long[$0..<($0 + short.count)].elementsEqual(short) }
    }

    private static func words(_ name: String) -> [String] {
      let scalars = name.decomposedStringWithCompatibilityMapping.unicodeScalars.filter {
        !CharacterSet.nonBaseCharacters.contains($0)
      }
      return String(scalars).lowercased().replacing(/['’ʼ]/, with: "")
        .split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }

    public func visitors(copy: Copy) -> String? {
      guard let group = wentBy, !group.isEmpty else { return visitedAt == nil ? nil : copy("plan.weWent") }
      return group.map { person in
        person.isYou ? copy("sharedLists.wentYou") :
          copy("sharedLists.wentOne", ["name": person.firstName ?? copy("sharedLists.someone")])
      }.joined(separator: " · ")
    }
  }

  public let _id, name, inviteToken: String
  public let isOwner, covered: Bool
  public let members: [Member]
  public let places: [Place]
  public let cities: [String]

  public func inviteURL(preview: Bool) -> URL {
    if preview {
      return URL(string: "shelvr-preview://list-invite")!.appending(component: inviteToken)
    }
    return URL(string: "https://tryshelvr.app")!.appending(component: "l").appending(component: inviteToken)
  }
}

extension Backend {
  public func socialQuery<T: Decodable>(_ name: String, arguments: [String: String], as type: T.Type)
    -> some AsyncSequence<T, any Error> {
    client.subscribe(to: name, with: arguments.mapValues { $0 as ConvexEncodable? }, yielding: type).values
  }

  public func joinList(token: String) async throws -> String? {
    try await client.mutation("sharedLists:joinSharedList", with: ["token": token])
  }

  public func listSeen(_ id: String) async throws {
    try await client.mutation("sharedLists:markSharedListSeen", with: ["listId": id])
  }

  public func markListPlace(_ id: String, went: Bool) async throws {
    try await client.mutation("sharedLists:setSharedListPlaceWent", with: ["placeId": id, "went": went])
  }
}

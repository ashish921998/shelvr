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
    public let itemId, addedByName: String?
    public let isNew: Bool
    public let visitedAt: Double?
    public let addedByYou: Bool
    public let wentBy: [Visitor]?
    public var id: String { _id }
    public var went: Bool { wentBy?.contains { $0.isYou } == true }
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

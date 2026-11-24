import ConvexMobile
import Foundation

public struct ListSavePlace: Decodable, Identifiable {
  public let itemId, name: String
  public let city, appleId: String?
  public let lat, lng: Double
  public var id: String { "\(itemId):\(name):\(lat):\(lng)" }
}

public struct ListPlaceSearch: Decodable {
  public struct Place: Decodable, Identifiable {
    public let name: String
    public let lat, lng: Double
    public let appleId, category, area: String?
    public var id: String { appleId ?? "\(name):\(lat):\(lng)" }
  }
  public let available: Bool
  public let places: [Place]
}

extension Backend {
  public func createList(name: String, cities: [String]) async throws -> String {
    struct Created: Decodable { let listId: String }
    let result: Created = try await client.mutation("sharedLists:createSharedList",
      with: ["name": name, "cities": cities.map { $0 as ConvexEncodable? }])
    return result.listId
  }

  public func leaveList(_ id: String) async throws {
    try await client.mutation("sharedLists:leaveSharedList", with: ["listId": id])
  }

  public func removeMember(_ user: String, from list: String) async throws {
    try await client.mutation("sharedLists:removeSharedListMember", with: ["listId": list, "memberId": user])
  }

  public func removeListPlace(_ id: String) async throws {
    try await client.mutation("sharedLists:removeSharedListPlace", with: ["placeId": id])
  }

  public func searchList(_ list: String, city: String, text: String, locale: String) async throws -> ListPlaceSearch {
    try await client.action("tripPlanner:searchListPlaces", with: ["listId": list, "city": city, "query": text, "locale": locale])
  }

  public func addSavedPlace(_ place: ListSavePlace, to list: String) async throws -> Bool {
    var args: [String: ConvexEncodable?] = ["listId": list, "itemId": place.itemId, "name": place.name]
    if let city = place.city { args["city"] = city }
    let inserted: Double = try await client.mutation("sharedLists:addSavePlaces", with: args)
    return inserted > 0
  }

  public func addFoundPlace(_ place: ListPlaceSearch.Place, city: String, to list: String) async throws {
    var row: [String: ConvexEncodable?] = ["city": city, "name": place.name, "lat": place.lat, "lng": place.lng]
    if let apple = place.appleId { row["appleId"] = apple }
    if let category = place.category { row["category"] = category }
    if let area = place.area { row["area"] = area }
    let _: String = try await client.mutation("sharedLists:addSharedListPlace", with: ["listId": list, "place": row])
  }
}

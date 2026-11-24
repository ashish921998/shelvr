import Combine
import ConvexMobile
import Foundation

public struct DateStart: Codable, ConvexEncodable, Hashable, Sendable {
  public let name: String
  public let lat: Double
  public let lng: Double
  public let appleId: String?
}

public struct GoOutPlace: Decodable, Hashable, Sendable {
  public let name: String
  public let city: String?
  public let lat: Double
  public let lng: Double
  public let appleId: String?
  public let kinds: [String]?
  public let category: String?

  public func matches(_ kind: String?) -> Bool {
    guard let kind else { return true }
    let types = kinds ?? category.flatMap { Self.categoryKinds[$0] }.map { [$0] } ?? []
    return kind == "food" ? types.contains { ["food", "coffee", "dessert"].contains($0) } : types.contains(kind)
  }

  private struct LegacyPin: Hashable {
    let name: String
    let lat: Double
    let lng: Double
  }

  public static func distinct(_ places: [Self], city: String, citySaves: [LibrarySave] = []) -> [Self] {
    let scoped = citySaves.flatMap { $0.placePins ?? [] }.filter { $0.city == nil }
    let appleIDs = Set(scoped.compactMap(\.appleId))
    let legacy = Set(scoped.compactMap { place -> LegacyPin? in
      guard let lat = place.lat, let lng = place.lng else { return nil }
      return LegacyPin(name: CityPlace.key(place.name), lat: lat, lng: lng)
    })
    func belongs(_ place: Self) -> Bool {
      if city.isEmpty { return true }
      if let named = place.city { return tidy(named) == tidy(city) }
      if let id = place.appleId, appleIDs.contains(id) { return true }
      return legacy.contains(LegacyPin(name: CityPlace.key(place.name), lat: place.lat, lng: place.lng))
    }
    func tidy(_ name: String) -> String { name.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased() }
    var result: [Self] = []
    var names = [String: [Int]]()
    var ids = [String: Int]()
    var knownApple = [Int: String]()
    for pin in places where belongs(pin) {
      let key = CityPlace.key(pin.name)
      if let id = pin.appleId, let index = ids[id] {
        if !(names[key] ?? []).contains(index) { names[key, default: []].append(index) }
        continue
      }
      if let index = names[key]?.first(where: { i in
        (knownApple[i] == nil || pin.appleId == nil || knownApple[i] == pin.appleId)
          && CityPlace.km(pin.lat, pin.lng, result[i].lat, result[i].lng) <= 0.3
      }) {
        if let id = pin.appleId { ids[id] = index; knownApple[index] = id }
        continue
      }
      if let id = pin.appleId { ids[id] = result.count; knownApple[result.count] = id }
      names[key, default: []].append(result.count)
      result.append(pin)
    }
    return result
  }

  public static func rolled(_ places: [Self], previous: Self?) -> Self? {
    let others = places.filter { $0 != previous }
    return (others.isEmpty ? places : others).randomElement()
  }

  private static let categoryKinds = [
    "Restaurant": "food",
    "FoodMarket": "food",
    "Cafe": "coffee",
    "Bakery": "dessert",
    "Nightlife": "drinks",
    "Brewery": "drinks",
    "Winery": "drinks",
    "Distillery": "drinks",
    "AmusementPark": "activities",
    "Aquarium": "activities",
    "Beach": "activities",
    "Bowling": "activities",
    "Castle": "activities",
    "Fortress": "activities",
    "GoKart": "activities",
    "Hiking": "activities",
    "Landmark": "activities",
    "MiniGolf": "activities",
    "MovieTheater": "activities",
    "Museum": "activities",
    "MusicVenue": "activities",
    "NationalMonument": "activities",
    "NationalPark": "activities",
    "Park": "activities",
    "Planetarium": "activities",
    "RockClimbing": "activities",
    "Skating": "activities",
    "Spa": "activities",
    "Stadium": "activities",
    "Theater": "activities",
    "Zoo": "activities",
    "Store": "shopping",
    "Hotel": "stay",
  ]
}

extension Backend {
  public func dateStarts(city: String, listID: String?) -> some AsyncSequence<[DateStart], any Error> {
    var args: [String: ConvexEncodable?] = ["city": city]
    if let listID { args["listId"] = listID }
    return client.subscribe(to: listID == nil ? "datePlanData:listDateStarts" : "sharedLists:listDateStarts", with: args, yielding: [DateStart].self).values
  }

  public struct GoOutList: Decodable, Sendable { public let places: [GoOutPlace] }

  public func goOutList(_ id: String) -> some AsyncSequence<GoOutList?, any Error> {
    client.subscribe(to: "sharedLists:getSharedList", with: ["listId": id], yielding: GoOutList?.self).values
  }
}

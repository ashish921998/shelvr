import ConvexMobile
import Combine
import Foundation

public struct CityPlace: Decodable, Identifiable, Hashable, Sendable {
  public let itemID: String
  public let name: String
  public let lat: Double
  public let lng: Double
  public var appleID: String?
  public var id: Self { self }

  static func key(_ name: String) -> String {
    let trimmed = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    let clipped = trimmed.utf16.count > 80 ? String(decoding: trimmed.utf16.prefix(79), as: UTF16.self) : trimmed
    let decomposed = clipped.decomposedStringWithCompatibilityMapping
    return String(decomposed.unicodeScalars.filter { !CharacterSet.nonBaseCharacters.contains($0) })
      .lowercased().filter { $0.isLetter || $0.isNumber }
  }

  static func km(_ lat: Double, _ lng: Double, _ otherLat: Double, _ otherLng: Double) -> Double {
    let rad = Double.pi / 180
    let a = pow(sin((otherLat - lat) * rad / 2), 2)
      + cos(lat * rad) * cos(otherLat * rad) * pow(sin((otherLng - lng) * rad / 2), 2)
    return 6371 * 2 * asin(sqrt(min(1, a)))
  }

  public static func remainingSaves(_ saves: [LibrarySave], pins: [Self]) -> [LibrarySave] {
    let represented = Set(pins.map(\.itemID))
    return saves.filter { !represented.contains($0.id) }
  }

  public static func pins(in saves: [LibrarySave]) -> [Self] {
    var kept = [Self]()
    var byName = [String: [Int]]()
    var byApple = [String: Int]()
    for save in saves {
      for place in save.placePins ?? [] {
        guard let lat = place.lat, let lng = place.lng else { continue }
        let key = key(place.name)
        if let id = place.appleId, let index = byApple[id] {
          if !(byName[key] ?? []).contains(index) { byName[key, default: []].append(index) }
          continue
        }
        if let index = byName[key]?.first(where: { index in
          let old = kept[index]
          return (old.appleID == nil || place.appleId == nil || place.appleId == old.appleID)
            && km(lat, lng, old.lat, old.lng) <= 0.3
        }) {
          if let id = place.appleId { kept[index].appleID = id; byApple[id] = index }
          continue
        }
        if let id = place.appleId { byApple[id] = kept.count }
        byName[key, default: []].append(kept.count)
        kept.append(Self(itemID: save.id, name: place.name, lat: lat, lng: lng, appleID: place.appleId))
      }
    }
    return kept
  }
}

extension Backend {
  public func citySaves(_ city: String) -> some AsyncSequence<[LibrarySave], any Error> {
    client.subscribe(to: "items:listCityItems", with: ["city": city], yielding: [LibrarySave].self).values
  }
}

extension CityPlace {
  public static func visited(_ visits: [MapVisit], among pins: [Self]) -> Set<Self> {
    let mapped = pins.map { pin in
      MapPlace(_id: nil, itemId: pin.itemID, appleId: pin.appleID, city: nil, category: nil, cuisine: nil,
        name: pin.name, lat: pin.lat, lng: pin.lng, kinds: [], features: nil)
    }
    let ids = MapVisit.visitedIDs(visits, among: mapped)
    return Set(zip(pins, mapped).compactMap { pin, place in ids.contains(place.id) ? pin : nil })
  }
}

extension Backend {
  public func changeVisit(_ pin: CityPlace, went: Bool) async throws {
    var spot: [String: ConvexEncodable?] = ["lat": pin.lat, "lng": pin.lng]
    if let apple = pin.appleID { spot["appleId"] = apple }
    try await client.mutation("placeVisits:setVisited",
      with: ["itemId": pin.itemID, "name": pin.name, "visited": went, "spot": spot])
  }
}

extension CityPlace {
  public struct CardPoint: Sendable {
    public let pin: CityPlace
    public let x, y: Double
  }

  public static func cardPoints(_ pins: [CityPlace], visited: Set<CityPlace>, width: Double, height: Double) -> [CardPoint] {
    guard !pins.isEmpty else { return [] }
    let mid = pins.count / 2
    let middle = (pins.map(\.lat).sorted()[mid], pins.map(\.lng).sorted()[mid])
    let distances = pins.map { km($0.lat, $0.lng, middle.0, middle.1) }
    let reach = max(10, distances.sorted()[mid] * 3)
    let nearby = zip(pins, distances).compactMap { pin, d in
      !visited.contains(pin) && (pins.count < 3 || d <= reach) ? pin : nil
    }
    let shown = (pins.filter(visited.contains) + nearby).prefix(40)
    let cosLat = cos(shown.map(\.lat).reduce(0, +) / Double(shown.count) * .pi / 180)
    let xs = shown.map { $0.lng * cosLat }, ys = shown.map { -$0.lat }
    guard let left = xs.min(), let right = xs.max(), let top = ys.min(), let bottom = ys.max() else { return [] }
    let span = max((right - left) / max(1, width - 32), (bottom - top) / max(1, height - 32))
    return shown.map { pin in
      let x = width / 2 + (span > 0 ? (pin.lng * cosLat - (left + right) / 2) / span : 0)
      let y = height / 2 + (span > 0 ? (-pin.lat - (top + bottom) / 2) / span : 0)
      return CardPoint(pin: pin, x: x, y: y)
    }
  }
}

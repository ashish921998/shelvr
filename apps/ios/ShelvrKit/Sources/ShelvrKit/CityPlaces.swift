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

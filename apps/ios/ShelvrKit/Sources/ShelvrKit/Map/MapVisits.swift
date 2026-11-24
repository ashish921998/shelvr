import Foundation

public struct MapVisit: Decodable, Sendable {
  public struct Spot: Decodable, Sendable {
    let lat, lng: Double
    let appleId: String?
  }
  let key, name: String?
  let spots: [Spot]?

  public static func visitedIDs(_ visits: [Self], among pins: [MapPlace]) -> Set<String> {
    var names = Set<String>(), appleIDs = Set<String>(), visited = Set<String>()
    var scoped: [String: [Spot]] = [:]
    let groups = Dictionary(grouping: pins) { MapPlace.key($0.name) }
    for visit in visits {
      guard let key = visit.key else { continue }
      guard let spots = visit.spots else { names.insert(key); continue }
      for candidate in Set([key, visit.name.map(bareKey) ?? key]) where !candidate.isEmpty {
        scoped[candidate, default: []] += spots
      }
      for spot in spots {
        if let id = spot.appleId { appleIDs.insert(id); continue }
        var distance = Double.infinity
        var nearest: MapPlace?
        for pin in groups[key] ?? [] {
          let km = MapPlace.km(spot.lat, spot.lng, pin.lat, pin.lng)
          if km <= 0.3 && km < distance { distance = km; nearest = pin }
        }
        if let nearest { visited.insert(nearest.id) }
      }
    }
    for pin in pins {
      let key = MapPlace.key(pin.name)
      if names.contains(key) || pin.appleId.map(appleIDs.contains) == true {
        visited.insert(pin.id)
      } else if [key, bareKey(pin.name)].contains(where: { candidate in
        scoped[candidate]?.contains {
          $0.lat == pin.lat && $0.lng == pin.lng &&
            ($0.appleId == nil || pin.appleId == nil || $0.appleId == pin.appleId)
        } == true
      }) {
        visited.insert(pin.id)
      }
    }
    return visited
  }

  private static func bareKey(_ name: String) -> String {
    MapPlace.key(String(name.prefix(while: { $0 != "," })))
  }
}

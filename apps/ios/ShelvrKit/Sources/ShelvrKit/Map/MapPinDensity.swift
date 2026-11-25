import MapKit

public struct MapPinDensity: Equatable {
  private struct Cell: Hashable {
    let column, row: Int
  }

  private let cellSize: Double

  public init(mapPointsPerScreenPoint: Double) {
    let world = MKMapRect.world.width
    let desired = min(world, max(1, mapPointsPerScreenPoint * 64))
    cellSize = exp2(floor(log2(desired)))
  }

  public init(projectedStart: MKMapPoint, projectedEnd: MKMapPoint, screenDistance: Double) {
    let world = MKMapRect.world.width
    let dx = abs(projectedEnd.x - projectedStart.x).truncatingRemainder(dividingBy: world)
    let dy = projectedEnd.y - projectedStart.y
    let distance = hypot(min(dx, world - dx), dy)
    self.init(mapPointsPerScreenPoint: distance / screenDistance)
  }

  public func representatives(from places: [MapPlace], inView: (MapPlace) -> Bool = { _ in true }) -> [MapPlace] {
    let entries = places.compactMap { place -> (place: MapPlace, point: MKMapPoint, cell: Cell)? in
      let coordinate = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
      guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
      let point = MKMapPoint(coordinate)
      guard point.x.isFinite, point.y.isFinite else { return nil }
      return (place, point, Cell(column: Int(floor(point.x / cellSize)), row: Int(floor(point.y / cellSize))))
    }

    var leaders: [Cell: (point: MKMapPoint, priority: Int)] = [:]
    for entry in entries {
      let priority = (inView(entry.place) ? 2 : 0) + (entry.place.isSaved ? 1 : 0)
      if let leader = leaders[entry.cell], leader.priority >= priority { continue }
      leaders[entry.cell] = (entry.point, priority)
    }
    return entries.compactMap { entry in
      guard let leader = leaders[entry.cell],
        entry.point.x == leader.point.x, entry.point.y == leader.point.y else { return nil }
      return entry.place
    }
  }
}

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

  public func representatives(from places: [MapPlace]) -> [MapPlace] {
    let entries = places.compactMap { place -> (place: MapPlace, point: MKMapPoint, cell: Cell)? in
      let coordinate = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
      guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
      let point = MKMapPoint(coordinate)
      return (place, point, Cell(column: Int(floor(point.x / cellSize)), row: Int(floor(point.y / cellSize))))
    }

    var leaders: [Cell: (point: MKMapPoint, saved: Bool)] = [:]
    for entry in entries {
      if let leader = leaders[entry.cell], leader.saved || !entry.place.isSaved { continue }
      leaders[entry.cell] = (entry.point, entry.place.isSaved)
    }
    return entries.compactMap { entry in
      guard let leader = leaders[entry.cell],
        entry.point.x == leader.point.x, entry.point.y == leader.point.y else { return nil }
      return entry.place
    }
  }
}

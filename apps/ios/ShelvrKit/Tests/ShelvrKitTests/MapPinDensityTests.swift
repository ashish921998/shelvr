import MapKit
import Testing
@testable import ShelvrKit

private func place(_ id: String, x: Double, y: Double, saved: Bool = true) -> MapPlace {
  let coordinate = MKMapPoint(x: x, y: y).coordinate
  return MapPlace(source: saved ? .saved(itemID: id) : .discover(placeID: id, features: []),
    name: id, lat: coordinate.latitude, lng: coordinate.longitude, appleId: nil, city: nil,
    category: nil, cuisine: nil, kinds: [])
}

@Test func zoomingInKeepsThePreviousPlaceAndRevealsItsNeighbors() {
  let x = MKMapRect.world.width / 2
  let y = MKMapRect.world.height / 2
  let first = place("First save", x: x + 900, y: y + 900)
  let next = place("Next save", x: x + 3500, y: y + 3700)
  let distant = place("Across town", x: x + 9000, y: y + 900)
  let places = [first, next, distant]
  let wide = MapPinDensity(mapPointsPerScreenPoint: 128)
  let close = MapPinDensity(mapPointsPerScreenPoint: 32)

  #expect(wide.representatives(from: places) == [first, distant])
  #expect(close.representatives(from: places) == places)
}

@Test func overviewPrefersSavedPlacesAndKeepsCoincidentGroupMembers() {
  let x = MKMapRect.world.width / 2
  let y = MKMapRect.world.height / 2
  let suggestion = place("Suggestion", x: x + 900, y: y + 900, saved: false)
  let first = place("Saved bakery", x: x + 1900, y: y + 1900)
  let sameCoordinate = place("Saved café", x: x + 1900, y: y + 1900)
  let laterSave = place("Saved shop", x: x + 2300, y: y + 2300)
  let density = MapPinDensity(mapPointsPerScreenPoint: 128)

  #expect(density.representatives(from: [suggestion, first, sameCoordinate, laterSave]) == [first, sameCoordinate])
}

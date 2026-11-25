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

@Test func aVisiblePlaceWinsAgainstOffscreenPlacesInTheSameCell() {
  let x = MKMapRect.world.width / 2
  let y = MKMapRect.world.height / 2
  let offscreen = place("Outside the viewport", x: x + 900, y: y + 900)
  let visible = place("On screen", x: x + 1900, y: y + 1900)
  let density = MapPinDensity(mapPointsPerScreenPoint: 128)

  #expect(density.representatives(from: [offscreen, visible]) == [offscreen])
  #expect(density.representatives(from: [offscreen, visible], inView: { $0 == visible }) == [visible])
}

@Test func densityIsStableWhenTheScreenSampleRotatesOrCrossesTheDateLine() {
  let world = MKMapRect.world.width
  let center = MKMapPoint(x: world / 2, y: world / 2)
  let delta = 127.73424 * 48
  let horizontal = MapPinDensity(projectedStart: center,
    projectedEnd: MKMapPoint(x: center.x + delta, y: center.y), screenDistance: 48)
  let vertical = MapPinDensity(projectedStart: center,
    projectedEnd: MKMapPoint(x: center.x, y: center.y - delta), screenDistance: 48)
  let wrapped = MapPinDensity(projectedStart: MKMapPoint(x: world - 320, y: center.y),
    projectedEnd: MKMapPoint(x: delta - 320, y: center.y), screenDistance: 48)

  #expect(horizontal == vertical)
  #expect(horizontal == wrapped)
  #expect(horizontal == MapPinDensity(mapPointsPerScreenPoint: 127.73424))
}

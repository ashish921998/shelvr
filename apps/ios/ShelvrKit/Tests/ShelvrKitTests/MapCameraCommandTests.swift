import CoreLocation
import Testing
@testable import ShelvrKit

@MainActor @Test func cameraCommandCanBeConsumedOnlyOnceAcrossViewInstances() {
  let tap = MapCameraCommand(action: .fitFilteredPlaces)
  let firstView = tap
  let nextView = tap

  guard case .fitFilteredPlaces? = nextView.consume() else {
    Issue.record("The new view must receive an unconsumed command")
    return
  }
  #expect(firstView.consume() == nil)
}

@MainActor @Test func cancellingCameraCommandInvalidatesEveryReferenceBeforeApplication() {
  let tap = MapCameraCommand(action: .locate(.init(latitude: 37.77, longitude: -122.42)))
  let pendingInMap = tap

  tap.cancel()

  #expect(pendingInMap.consume() == nil)
}

@MainActor @Test func aSearchFitsOnceMoreWhenItsCatalogResponseArrives() {
  let search = MapCameraCommand(action: .fitFilteredPlaces, refitWhenCatalogArrives: true)
  guard case .fitFilteredPlaces? = search.consume() else {
    Issue.record("Existing matches must fit immediately")
    return
  }

  #expect(search.takeCatalogRefit())
  #expect(search.consume() == nil)
  #expect(!search.takeCatalogRefit())
}

@MainActor @Test func cancelledAndOrdinaryFitsIgnoreCatalogResponses() {
  let search = MapCameraCommand(action: .fitFilteredPlaces, refitWhenCatalogArrives: true)
  _ = search.consume()
  search.cancel()
  #expect(!search.takeCatalogRefit())
  #expect(search.consume() == nil)

  let category = MapCameraCommand(action: .fitFilteredPlaces)
  _ = category.consume()
  #expect(!category.takeCatalogRefit())
  #expect(category.consume() == nil)
}

@Test func cancelledLocationRequestIgnoresALateFixAndCanStartAgain() {
  var request = MapLocationRequest()
  let coordinate = CLLocationCoordinate2D(latitude: 37.77, longitude: -122.42)
  let old = request.begin()
  request.cancel()
  request.resolve(coordinate, for: old)
  #expect(request.latestFix == nil)

  let current = request.begin()
  request.resolve(.init(latitude: 35, longitude: 139), for: old)
  #expect(request.pendingID == current)
  #expect(request.latestFix == nil)

  request.resolve(coordinate, for: current)
  let firstFix = request.latestFix
  #expect(firstFix?.coordinate.longitude == coordinate.longitude)
  #expect(request.pendingID == nil)
  let next = request.begin()
  request.resolve(coordinate, for: next)
  #expect(request.latestFix?.id != firstFix?.id)
}

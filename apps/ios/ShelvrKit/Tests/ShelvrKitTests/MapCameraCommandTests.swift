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

@Test func cancelledLocationRequestIgnoresALateFixAndCanStartAgain() {
  var request = MapLocationRequest()
  let coordinate = CLLocationCoordinate2D(latitude: 37.77, longitude: -122.42)
  request.begin()
  request.cancel()
  request.resolve(coordinate)
  #expect(request.latestFix == nil)

  request.begin()
  request.resolve(coordinate)
  let firstFix = request.latestFix
  #expect(firstFix?.coordinate.longitude == coordinate.longitude)
  #expect(!request.isPending)
  request.begin()
  request.resolve(coordinate)
  #expect(request.latestFix?.id != firstFix?.id)
}

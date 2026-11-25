import CoreLocation
import Observation
import ShelvrKit

@MainActor @Observable
final class MapLocation: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var request = MapLocationRequest()
  var latestFix: MapLocationRequest.Fix? { request.latestFix }
  var unavailable = false

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyKilometer
  }

  func locate() {
    request.begin()
    switch manager.authorizationStatus {
    case .notDetermined: manager.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
    default: cancel(); unavailable = true
    }
  }

  func cancel() {
    if request.isPending || request.latestFix != nil { request.cancel() }
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      guard self.request.isPending, self.manager.authorizationStatus != .notDetermined else { return }
      self.locate()
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in
      guard self.request.isPending, let fix = locations.last else { return }
      self.request.resolve(fix.coordinate)
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
    Task { @MainActor in
      guard self.request.isPending else { return }
      self.cancel()
      self.unavailable = true
    }
  }
}

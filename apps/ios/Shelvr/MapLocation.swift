import CoreLocation
import Observation

@MainActor @Observable
final class MapLocation: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var wanted = false
  private(set) var position: CLLocation?
  var unavailable = false

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyKilometer
  }

  func locate() {
    wanted = true
    switch manager.authorizationStatus {
    case .notDetermined: manager.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
    default: wanted = false; unavailable = true
    }
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      guard self.wanted, self.manager.authorizationStatus != .notDetermined else { return }
      self.locate()
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in
      guard self.wanted, let fix = locations.last else { return }
      self.wanted = false
      self.position = fix
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
    Task { @MainActor in
      guard self.wanted else { return }
      self.wanted = false
      self.unavailable = true
    }
  }
}

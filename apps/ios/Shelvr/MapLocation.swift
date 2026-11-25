import CoreLocation
import Observation
import ShelvrKit

@MainActor @Observable
final class MapLocation {
  @ObservationIgnored private var attempt: Attempt?
  private var request = MapLocationRequest()
  var latestFix: MapLocationRequest.Fix? { request.latestFix }
  var unavailable = false

  func locate() {
    let attemptID = request.begin()
    let next = Attempt(id: attemptID, owner: self)
    attempt = next
    next.start()
  }

  func cancel() {
    attempt = nil
    if request.pendingID != nil || request.latestFix != nil { request.cancel() }
  }

  private func receive(_ coordinate: CLLocationCoordinate2D, for id: UUID) {
    guard request.pendingID == id else { return }
    request.resolve(coordinate, for: id)
    attempt = nil
  }

  private func fail(_ id: UUID) {
    guard request.pendingID == id else { return }
    cancel()
    unavailable = true
  }

  @MainActor private final class Attempt: NSObject, CLLocationManagerDelegate {
    let id: UUID
    weak var owner: MapLocation?
    private let manager = CLLocationManager()
    private var locating = false

    init(id: UUID, owner: MapLocation) {
      self.id = id
      self.owner = owner
      super.init()
      manager.delegate = self
      manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func start() {
      guard !locating else { return }
      switch manager.authorizationStatus {
      case .notDetermined: manager.requestWhenInUseAuthorization()
      case .authorizedWhenInUse, .authorizedAlways:
        locating = true
        manager.requestLocation()
      default: owner?.fail(id)
      }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
      Task { @MainActor [weak self] in
        guard let self, self.manager.authorizationStatus != .notDetermined else { return }
        if self.manager.authorizationStatus == .denied || self.manager.authorizationStatus == .restricted {
          self.owner?.fail(self.id)
        } else { self.start() }
      }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
      guard let coordinate = locations.last?.coordinate else { return }
      Task { @MainActor [weak self] in
        guard let self else { return }
        self.owner?.receive(coordinate, for: self.id)
      }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
      Task { @MainActor [weak self] in
        guard let self else { return }
        self.owner?.fail(self.id)
      }
    }
  }
}

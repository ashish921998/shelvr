import MapKit
import ShelvrKit
import SwiftUI

struct MapCanvas: UIViewRepresentable {
  let places: [MapPlace]
  let location: CLLocation?
  let filters: MapFilters
  let opening: [MapPlace]?
  let visited: Set<String>
  let copy: Copy
  let overview: Int
  let overviewPlaces: [MapPlace]
  let topControlsHeight: CGFloat
  let bottomControlsHeight: CGFloat
  let onArea: (DiscoverBox, MapViewport) -> Void
  let onPick: (MapPlace) -> Void
  let onCluster: ([MapPlace]) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> MKMapView {
    let map = MKMapView()
    map.delegate = context.coordinator
    map.register(PlaceAnnotationView.self, forAnnotationViewWithReuseIdentifier: PlaceAnnotationView.placeIdentifier)
    map.register(PlaceAnnotationView.self, forAnnotationViewWithReuseIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier)
    map.pointOfInterestFilter = .excludingAll
    return map
  }

  func updateUIView(_ map: MKMapView, context: Context) {
    context.coordinator.update(self, map: map)
  }

  final class Pin: NSObject, MKAnnotation {
    let place: MapPlace
    let visited: Bool
    let coordinate: CLLocationCoordinate2D
    var title: String? { place.name }
    init(_ place: MapPlace, visited: Bool) {
      self.place = place
      self.visited = visited
      self.coordinate = place.coordinate
    }
  }

  final class Coordinator: NSObject, MKMapViewDelegate {
    var parent: MapCanvas
    var pins: [String: Pin] = [:]
    var opened = false
    var queryingNearby = false
    init(_ parent: MapCanvas) { self.parent = parent }

    func update(_ parent: MapCanvas, map: MKMapView) {
      let changedLocation = self.parent.location !== parent.location
      let changedFilter = self.parent.filters != parent.filters
      let changedOverview = self.parent.overview != parent.overview
      self.parent = parent
      let ids = Set(parent.places.map(\.id))
      for (id, pin) in pins where !ids.contains(id) {
        pins.removeValue(forKey: id)
        map.removeAnnotation(pin)
      }
      var added: [Pin] = []
      for place in parent.places {
        let went = parent.visited.contains(place.id)
        if let current = pins[place.id] {
          if current.place == place && current.visited == went { continue }
          map.removeAnnotation(current)
        }
        let pin = Pin(place, visited: went)
        pins[place.id] = pin
        added.append(pin)
      }
      map.addAnnotations(added)
      if changedLocation, let location = parent.location {
        opened = true
        queryingNearby = true
        map.showsUserLocation = true
        map.setRegion(.init(center: location.coordinate, latitudinalMeters: 6000, longitudinalMeters: 6000),
          animated: true)
      }
      if changedFilter, opened, !parent.places.isEmpty,
        !parent.places.contains(where: { map.visibleMapRect.contains(MKMapPoint($0.coordinate)) }) {
        fit(parent.places, on: map, animated: true)
      }
      if changedOverview {
        opened = true
        queryingNearby = false
        fit(parent.overviewPlaces, on: map, animated: true)
      }
      if !opened, let places = parent.opening {
        opened = true
        fit(places, on: map, animated: false)
      }
    }

    private func fit(_ places: [MapPlace], on map: MKMapView, animated: Bool) {
      guard let first = places.first else { return }
      var rect = MKMapRect.null
      let origin = MKMapPoint(first.coordinate)
      for place in places {
        var point = MKMapPoint(place.coordinate)
        point.x -= ((point.x - origin.x) / MKMapRect.world.width).rounded() * MKMapRect.world.width
        rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 1, height: 1))
      }
      let pad = 700 * MKMapPointsPerMeterAtLatitude(first.lat)
      let maxInset = map.bounds.height * 0.35
      map.setVisibleMapRect(rect.insetBy(dx: -pad, dy: -pad), edgePadding:
        .init(top: min(maxInset, map.safeAreaInsets.top + parent.topControlsHeight + 8), left: 32,
          bottom: min(maxInset, map.safeAreaInsets.bottom + parent.bottomControlsHeight + 8), right: 32),
        animated: animated)
    }

    func mapView(_ map: MKMapView, regionWillChangeAnimated animated: Bool) {
      if hasActiveGesture(map) { opened = true; queryingNearby = false }
    }

    private func hasActiveGesture(_ view: UIView) -> Bool {
      for gesture in view.gestureRecognizers ?? [] {
        if gesture.state == .began || gesture.state == .changed { return true }
      }
      return view.subviews.contains(where: hasActiveGesture)
    }

    func mapView(_ map: MKMapView, regionDidChangeAnimated animated: Bool) {
      let region = map.region
      if let box = DiscoverBox.visible(latitude: region.center.latitude, longitude: region.center.longitude,
        latitudeDelta: region.span.latitudeDelta, longitudeDelta: region.span.longitudeDelta,
        width: map.bounds.width, height: map.bounds.height, tilted: map.camera.pitch > 0) {
        let result = queryingNearby
          ? box.includingNearby(latitude: region.center.latitude, longitude: region.center.longitude)
          : box
        let viewport = MapViewport(center: region.center,
          cityScale: region.span.longitudeDelta <= map.bounds.width * 360 / (256 * 512))
        Task { @MainActor in parent.onArea(result, viewport) }
      }
    }

    func mapView(_ map: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
      if let pin = annotation as? Pin,
        let view = map.dequeueReusableAnnotationView(withIdentifier: PlaceAnnotationView.placeIdentifier, for: pin)
          as? PlaceAnnotationView {
        view.showPlace(emoji: pin.place.emoji, saved: pin.place.isSaved, visited: pin.visited,
          title: pin.place.name, visitedLabel: parent.copy("passport.wentNoDate"))
        return view
      }
      if let cluster = annotation as? MKClusterAnnotation,
        let view = map.dequeueReusableAnnotationView(withIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier,
          for: cluster) as? PlaceAnnotationView {
        let count = cluster.memberAnnotations.count
        let includesSavedPlace = cluster.memberAnnotations.contains { ($0 as? Pin)?.place.isSaved == true }
        view.showCluster(count: count, label: parent.copy("passport.placesCount", count: count), saved: includesSavedPlace)
        return view
      }
      return nil
    }

    func mapView(_ map: MKMapView, didSelect view: MKAnnotationView) {
      guard let annotation = view.annotation else { return }
      map.deselectAnnotation(annotation, animated: false)
      if let pin = annotation as? Pin { parent.onPick(pin.place) }
      if let cluster = annotation as? MKClusterAnnotation {
        let places = cluster.memberAnnotations.compactMap { ($0 as? Pin)?.place }
        if map.region.span.longitudeDelta < 0.01 ||
          Set(places.map { MKMapPoint($0.coordinate).x }).count == 1 {
          parent.onCluster(places)
        } else { fit(places, on: map, animated: true) }
      }
    }
  }
}

struct MapViewport: Equatable {
  let center: CLLocationCoordinate2D
  let cityScale: Bool

  static func == (lhs: Self, rhs: Self) -> Bool {
    lhs.center.latitude == rhs.center.latitude && lhs.center.longitude == rhs.center.longitude &&
      lhs.cityScale == rhs.cityScale
  }

  func city(among places: [MapPlace]) -> String? {
    guard cityScale else { return nil }
    let point = MKMapPoint(center)
    var nearest: String?
    var closest: CLLocationDistance = 50_000
    for place in places {
      guard let city = place.city, !city.isEmpty else { continue }
      let distance = point.distance(to: MKMapPoint(place.coordinate))
      if distance <= closest {
        closest = distance
        nearest = city
      }
    }
    return nearest
  }
}

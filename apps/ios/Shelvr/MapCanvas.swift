import MapKit
import ShelvrKit
import SwiftUI

struct MapCanvas: UIViewRepresentable {
  let places: [MapPlace]
  let location: CLLocation?
  let filterKey: [String]
  let opening: [MapPlace]?
  let visited: Set<String>
  let onArea: (DiscoverBox) -> Void
  let onPick: (MapPlace) -> Void
  let onCluster: ([MapPlace]) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> MKMapView {
    let map = MKMapView()
    map.delegate = context.coordinator
    map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: "place")
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
      let changedFilter = self.parent.filterKey != parent.filterKey
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
      if !opened, let saved = parent.opening, !saved.isEmpty {
        opened = true
        let groups = Dictionary(grouping: saved) { ($0.city ?? "").lowercased() }
        let city = saved.compactMap { $0.city?.lowercased() }.max {
          groups[$0, default: []].count < groups[$1, default: []].count
        }
        let places = city.flatMap { groups[$0] } ?? saved
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
      map.setVisibleMapRect(rect.insetBy(dx: -pad, dy: -pad), edgePadding:
        .init(top: 38, left: 32, bottom: 38, right: 32), animated: animated)
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
        Task { @MainActor in parent.onArea(result) }
      }
    }

    func mapView(_ map: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
      guard let pin = annotation as? Pin else { return nil }
      guard let view = map.dequeueReusableAnnotationView(withIdentifier: "place", for: pin)
        as? MKMarkerAnnotationView else { return nil }
      view.clusteringIdentifier = "places"
      view.markerTintColor = pin.place.isSaved ? .systemOrange : .systemTeal
      view.glyphImage = nil
      view.glyphText = pin.visited ? "✓" : pin.place.emoji
      view.displayPriority = pin.place.isSaved ? .defaultHigh : .defaultLow
      return view
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

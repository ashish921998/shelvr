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
    context.coordinator.installNames(on: map)
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
    private var compactPins = true
    private var pinDensity = MapPinDensity(mapPointsPerScreenPoint: MKMapRect.world.width / 390)
    private var nameLayout: Task<Void, Never>?
    private let addedViews = NSHashTable<PlaceAnnotationView>.weakObjects()
    private let nameOverlay = UIView()
    init(_ parent: MapCanvas) { self.parent = parent }

    func installNames(on map: MKMapView) {
      nameOverlay.frame = map.bounds
      nameOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      nameOverlay.isUserInteractionEnabled = false
      nameOverlay.accessibilityElementsHidden = true
      map.addSubview(nameOverlay)
    }

    func update(_ parent: MapCanvas, map: MKMapView) {
      let changedLocation = self.parent.location !== parent.location
      let changedFilter = self.parent.filters != parent.filters
      let changedOverview = self.parent.overview != parent.overview
      self.parent = parent
      synchronizePins(on: map)
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
      scheduleNames(on: map)
    }

    private var usesOverviewDensity: Bool {
      let filters = parent.filters
      return compactPins && !filters.hasSearch && filters.kinds.isEmpty && filters.went == .all
    }

    private func synchronizePins(on map: MKMapView, rebuild: Bool = false) {
      let places: [MapPlace]
      if usesOverviewDensity {
        places = pinDensity.representatives(from: parent.places) { place in
          map.bounds.contains(map.convert(place.coordinate, toPointTo: map))
        }
      } else { places = parent.places }
      let ids = Set(places.map(\.id))
      let removed = pins.keys.filter { !ids.contains($0) }
      map.removeAnnotations(removed.compactMap { pins.removeValue(forKey: $0) })
      var added: [Pin] = []
      for place in places {
        let went = parent.visited.contains(place.id)
        if let current = pins[place.id] {
          if !rebuild, current.place == place && current.visited == went { continue }
          map.removeAnnotation(current)
        }
        let pin = Pin(place, visited: went)
        pins[place.id] = pin
        added.append(pin)
      }
      map.addAnnotations(added)
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
      clearNames()
      nameLayout?.cancel()
      nameLayout = nil
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
      updatePinScale(on: map)
      scheduleNames(on: map)
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

    func mapViewDidChangeVisibleRegion(_ map: MKMapView) {
      clearNames()
      nameLayout?.cancel()
      nameLayout = nil
      scheduleNames(on: map)
    }

    func mapView(_ map: MKMapView, didAdd views: [MKAnnotationView]) {
      for case let view as PlaceAnnotationView in views { addedViews.add(view) }
      scheduleNames(on: map)
    }

    func mapViewDidFinishRenderingMap(_ map: MKMapView, fullyRendered: Bool) {
      scheduleNames(on: map)
    }

    private func scheduleNames(on map: MKMapView) {
      guard !compactPins, nameLayout == nil else { return }
      nameLayout = Task { @MainActor [weak self, weak map] in
        do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
        guard !Task.isCancelled, let self else { return }
        nameLayout = nil
        guard let map, !compactPins else { return }
        layoutNames(on: map)
      }
    }

    private func clearNames() {
      for label in nameOverlay.subviews { label.removeFromSuperview() }
    }

    private func layoutNames(on map: MKMapView) {
      clearNames()
      let usable = map.bounds.inset(by: UIEdgeInsets(top: map.safeAreaInsets.top + parent.topControlsHeight + 8,
        left: 8, bottom: map.safeAreaInsets.bottom + parent.bottomControlsHeight + 8, right: 8))
      let visible = addedViews.allObjects.filter { view in
        guard let annotation = view.annotation else { return false }
        return map.view(for: annotation) === view && !view.isHidden &&
          map.bounds.intersects(view.convert(view.bounds, to: map))
      }
      let targets = visible.map { (view: $0, frame: $0.convert($0.pinHitBounds, to: map)) }
      var occupied: [CGRect] = []
      if let location = map.view(for: map.userLocation) {
        occupied.append(location.convert(location.bounds, to: map).insetBy(dx: -2, dy: -2))
      }
      let candidates = visible.compactMap { view -> (view: PlaceAnnotationView, pin: Pin, distance: CGFloat)? in
        guard let pin = view.annotation as? Pin else { return nil }
        let center = view.convert(CGPoint(x: view.bounds.midX, y: view.bounds.midY), to: map)
        guard usable.contains(center) else { return nil }
        let distance = hypot(center.x - usable.midX, center.y - usable.midY)
        return (view, pin, distance)
      }.sorted {
        if $0.pin.place.isSaved != $1.pin.place.isSaved { return $0.pin.place.isSaved }
        if $0.distance != $1.distance { return $0.distance < $1.distance }
        return $0.pin.place.id < $1.pin.place.id
      }
      map.bringSubviewToFront(nameOverlay)
      for candidate in candidates {
        let view = candidate.view
        let marker = view.convert(view.bounds, to: map)
        let badge = MapPlaceNameBadge(title: candidate.pin.place.name, traits: map.traitCollection)
        for x in [marker.maxX + 3, marker.minX - badge.bounds.width - 3] {
          let frame = CGRect(x: x, y: marker.midY - badge.bounds.height / 2,
            width: badge.bounds.width, height: badge.bounds.height)
          guard usable.contains(frame),
            !targets.contains(where: { $0.view !== view && $0.frame.intersects(frame) }),
            !occupied.contains(where: { $0.intersects(frame) }) else { continue }
          badge.frame = frame
          nameOverlay.addSubview(badge)
          occupied.append(frame.insetBy(dx: -3, dy: -3))
          break
        }
      }
    }

    private func updatePinScale(on map: MKMapView) {
      let halfSample = min(24, map.bounds.width / 4)
      guard halfSample > 0, map.bounds.height > 0 else { return }
      let left = CGPoint(x: map.bounds.midX - halfSample, y: map.bounds.midY)
      let right = CGPoint(x: map.bounds.midX + halfSample, y: map.bounds.midY)
      let west = map.convert(left, toCoordinateFrom: map)
      let east = map.convert(right, toCoordinateFrom: map)
      guard CLLocationCoordinate2DIsValid(west), CLLocationCoordinate2DIsValid(east) else { return }
      let start = CLLocation(latitude: west.latitude, longitude: west.longitude)
      let end = CLLocation(latitude: east.latitude, longitude: east.longitude)
      let metersPerPoint = start.distance(from: end) / (2 * halfSample)
      let nextCompact = compactPins ? metersPerPoint > 8 : metersPerPoint >= 10
      let changedStyle = nextCompact != compactPins
      compactPins = nextCompact
      if usesOverviewDensity {
        pinDensity = MapPinDensity(projectedStart: MKMapPoint(west), projectedEnd: MKMapPoint(east),
          screenDistance: 2 * halfSample)
      }
      guard changedStyle || usesOverviewDensity else { return }
      clearNames()
      synchronizePins(on: map, rebuild: changedStyle)
    }

    func mapView(_ map: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
      let identifier: String
      switch annotation {
      case is Pin: identifier = PlaceAnnotationView.placeIdentifier
      case is MKClusterAnnotation: identifier = MKMapViewDefaultClusterAnnotationViewReuseIdentifier
      default: return nil
      }
      let view = map.dequeueReusableAnnotationView(withIdentifier: identifier, for: annotation) as? PlaceAnnotationView
      if let view {
        addedViews.add(view)
        view.configure(copy: parent.copy, compact: compactPins)
      }
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

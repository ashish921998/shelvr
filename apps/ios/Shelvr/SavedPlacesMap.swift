import MapKit
import ShelvrKit
import SwiftUI

struct SavedPlacesMap: View {
  let open: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var saved: [MapPlace]?
  @State private var discover: [MapPlace] = []
  @State private var receivedDiscover = false
  @State private var visits: [MapVisit] = []
  @State private var area = DiscoverBox.world
  @State private var kinds: Set<String> = []
  @State private var went = "all"
  @State private var location = MapLocation()
  @State private var search = ""
  @State private var selected: MapPlace?
  @State private var card: MKMapItem?
  @State private var cluster: [MapPlace] = []
  @State private var errors = Set<String>()
  @State private var retry = 0

  var body: some View {
    let own = saved ?? []
    let visited = MapVisit.visitedIDs(visits, among: own)
    let filter = visited.isEmpty ? "all" : went
    let entries = MapPlace.combined(saved: own, discover: filter == "all" ? discover : [])
    let chips = MapPlace.filterKinds(entries, selected: kinds)
    let filtered = entries.filter { place in
      (filter == "all" || visited.contains(place.id) == (filter == "went")) &&
        (kinds.isEmpty || !kinds.isDisjoint(with: place.kinds))
    }
    let visible = MapPlace.search(filtered, query: search)
    let filtering = filter != "all" || !kinds.isEmpty || !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let opening = MapPlace.openingPins(saved: saved, discover: discover, visible: visible, filtered: filtering)
    MapCanvas(places: visible, location: location.position, filterKey: [filter, search] + kinds.sorted(), opening: opening, visited: visited, onArea: { area = $0 },
      onPick: { selected = $0 }, onCluster: { cluster = $0 })
      .overlay(alignment: .bottom) {
        if saved?.isEmpty == true, receivedDiscover, discover.isEmpty, errors.isEmpty {
          VStack(alignment: .leading) {
            Text(copy("map.emptyTitle")).font(.headline)
            Text(copy("map.emptyBody")).font(.subheadline)
          }.padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)).padding()
        }
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            TextField(copy("map.searchPlaceholder"), text: $search)
              .textFieldStyle(.roundedBorder).submitLabel(.search).autocorrectionDisabled()
            Button { location.locate() } label: {
              Image(systemName: "location").frame(width: 44, height: 44)
            }.accessibilityLabel(copy("map.showMyLocation"))
          }
          if !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ForEach(visible.prefix(5)) { place in
              Button { Analytics.capture("map_search_result_opened"); selected = place } label: {
                Label(place.name, systemImage: place.isSaved ? "bookmark" : "mappin")
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
            }
            if visible.isEmpty { Text(copy("map.searchNoResults", ["query": search])).font(.caption) }
          }
          if !visited.isEmpty {
            Picker(copy("map.filters"), selection: $went) {
              Text(copy("map.filterAll")).tag("all")
              Text(copy("passport.wantToGo")).tag("want")
              Text(copy("passport.wentNoDate")).tag("went")
            }.pickerStyle(.segmented)
          }
          if !chips.isEmpty {
            ScrollView(.horizontal) {
              HStack {
                ForEach(chips, id: \.self) { kind in
                  let key = "map.kind" + kind.prefix(1).uppercased() + kind.dropFirst()
                  Button(copy(key)) {
                    if kinds.insert(kind).inserted { Analytics.capture("map_filter_selected", ["kind": kind]) } else { kinds.remove(kind) }
                  }
                  .buttonStyle(.bordered).tint(kinds.contains(kind) ? .accentColor : .secondary)
                  .accessibilityAddTraits(kinds.contains(kind) ? .isSelected : [])
                }
              }
            }.scrollIndicators(.hidden)
          }
          if !errors.isEmpty { Button(copy("common.retry")) { retry += 1 } }
        }.padding(.horizontal).padding(.vertical, 6).background(.thinMaterial)
      }
      .alert(copy("common.unavailable"), isPresented: $location.unavailable) {
        Button(copy("common.close")) {}
      }
      .mapItemDetailSheet(item: $card, displaysMap: false)
      .sheet(isPresented: Binding(get: { !cluster.isEmpty }, set: { if !$0 { cluster = [] } })) {
        List(cluster) { place in
          Button(place.name) { cluster = []; selected = place }
        }.presentationDetents([.medium, .large])
      }
      .task(id: retry) {
        await subscribe("saved") {
          for try await rows in backend.query("mapPlaces:listMapPlaces", as: [MapPlace].self) {
            try Task.checkCancellation()
            saved = rows
          }
        }
      }
      .task(id: retry) {
        await subscribe("visits") {
          for try await rows in backend.query("placeVisits:listVisits", as: [MapVisit].self) {
            try Task.checkCancellation()
            visits = rows
          }
        }
      }
      .task(id: AreaRequest(area: area, retry: retry)) {
        await subscribe("discover") {
          for try await page in backend.discover(in: area) {
            try Task.checkCancellation()
            receivedDiscover = true
            discover = page.places
          }
        }
      }
      .task(id: selected) {
        guard let place = selected else { return }
        if let raw = place.appleId, let identifier = MKMapItem.Identifier(rawValue: raw),
          let item = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem {
          guard !Task.isCancelled else { return }
          Analytics.capture("map_place_opened", ["card": true, "source": place.isSaved ? "own" : "discover"])
          card = item
        } else {
          guard !Task.isCancelled else { return }
          if let id = place.itemId { Analytics.capture("map_place_opened", ["card": false, "source": "own"]); open("/item/" + id) }
          else {
            let item = MKMapItem(placemark: MKPlacemark(coordinate: place.coordinate))
            item.name = place.name
            Analytics.capture("map_place_opened", ["source": "discover", "card": true])
            card = item
          }
        }
        selected = nil
      }
  }

  private struct AreaRequest: Equatable {
    let area: DiscoverBox
    let retry: Int
  }

  private func subscribe(_ key: String, _ update: () async throws -> Void) async {
    errors.remove(key)
    do { try await update() }
    catch { if !Task.isCancelled { errors.insert(key) } }
  }
}

extension MapPlace {
  var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
}

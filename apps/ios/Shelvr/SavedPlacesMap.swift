import MapKit
import ShelvrKit
import SwiftUI

struct SavedPlacesMap: View {
  let open: (String) -> Void
  let tabBar: HomeTabBar
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var saved: [MapPlace]?
  @State private var discover: [MapPlace] = []
  @State private var receivedDiscover = false
  @State private var visits: [MapVisit] = []
  @State private var area = DiscoverBox.world
  @State private var filters = MapFilters()
  @State private var location = MapLocation()
  @State private var selected: MapPlace?
  @State private var card: MKMapItem?
  @State private var cluster: [MapPlace] = []
  @State private var errors = Set<String>()
  @State private var retry = 0
  @State private var viewport: MapViewport?
  @State private var overview = 0
  @State private var topControlsHeight: CGFloat = 50
  @State private var bottomControlsHeight: CGFloat = 104
  @State private var searching = false
  @State private var resultsOpen = true
  @FocusState private var focusedSearch: Bool

  var body: some View {
    let scene = MapScene(saved: saved, discover: discover, visits: visits, filters: filters)
    let palette = HomeChromePalette(scheme, appearance: appearance)
    let personalPlaces = saved ?? []
    let overviewPlaces = scene.visible.filter(\.isSaved)
    MapCanvas(places: scene.visible, location: location.position, filters: scene.filters, opening: scene.opening,
      visited: scene.visited, overview: overview, overviewPlaces: overviewPlaces, topControlsHeight: topControlsHeight,
      bottomControlsHeight: bottomControlsHeight, onArea: { area = $0; viewport = $1 },
      onPick: { selected = $0 }, onCluster: { cluster = $0 })
      .ignoresSafeArea(.container)
      .overlay(alignment: .top) {
        Group {
          if searching { searchPanel(scene, palette: palette) }
          else { mapHeader(personalPlaces: personalPlaces, overviewPlaces: overviewPlaces, palette: palette) }
        }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { topControlsHeight = $0 }
      }
      .overlay(alignment: .bottom) {
        if !focusedSearch {
          mapFooter(scene, palette: palette)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bottomControlsHeight = $0 }
        }
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
          for try await rows in backend.savedMapPlaces() {
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
        guard let owner = backend.userID else { return }
        let session = backend.sessionGeneration
        if let raw = place.appleId, let identifier = MKMapItem.Identifier(rawValue: raw),
          let item = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem {
          guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
          Analytics.capture("map_place_opened", ["card": true, "source": place.isSaved ? "own" : "discover"])
          card = item
        } else {
          guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
          if case let .saved(id) = place.source {
            Analytics.capture("map_place_opened", ["card": false, "source": "own"])
            open("/item/" + id)
          } else {
            let item = MKMapItem(placemark: MKPlacemark(coordinate: place.coordinate))
            item.name = place.name
            Analytics.capture("map_place_opened", ["source": "discover", "card": true])
            card = item
          }
        }
        selected = nil
      }
  }

  private func mapHeader(personalPlaces: [MapPlace], overviewPlaces: [MapPlace], palette: HomeChromePalette) -> some View {
    let city = viewport?.city(among: personalPlaces)
    return VStack(spacing: 6) {
      HStack(spacing: 7) {
        if let city {
          if overviewPlaces.contains(where: { place in
            guard let other = place.city, !other.isEmpty else { return false }
            return other.caseInsensitiveCompare(city) != .orderedSame
          }) {
            roundButton("chevron.left", label: copy("map.showAllCities"), palette: palette) { overview += 1 }
          }
          Button {
            if let encoded = city.addingPercentEncoding(withAllowedCharacters: .alphanumerics) { open("/city/" + encoded) }
          } label: {
            Text(city).font(.custom("Satoshi-Bold", size: 32, relativeTo: .largeTitle))
              .tracking(-0.8).lineLimit(1).minimumScaleFactor(0.6)
              .shadow(color: palette.frame, radius: 4)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        } else {
          Text("shelvr").font(.custom("CrimsonProRoman-Regular", size: 28, relativeTo: .title2))
            .tracking(0.5).frame(maxWidth: .infinity, alignment: .leading)
        }
        roundButton("magnifyingglass", label: copy("map.searchPlaceholder"), palette: palette) {
          searching = true
          resultsOpen = true
        }
        roundButton("person", label: copy("navigation.profile"), palette: palette) { open("/profile") }
      }
      .frame(minHeight: 50)
      roundButton("location", label: copy("map.showMyLocation"), palette: palette) { location.locate() }
        .frame(maxWidth: .infinity, alignment: .trailing)
      retryControl(palette)
    }
    .padding(.horizontal, 20)
    .foregroundStyle(palette.foreground)
    .buttonStyle(HomeChromePressStyle())
  }

  private func mapFooter(_ scene: MapScene, palette: HomeChromePalette) -> some View {
    VStack(spacing: 6) {
      if !searching {
        if saved?.isEmpty == true, receivedDiscover, discover.isEmpty, errors.isEmpty {
          VStack(alignment: .leading) {
            Text(copy("map.emptyTitle")).font(.custom("Satoshi-Bold", size: 16, relativeTo: .headline))
            Text(copy("map.emptyBody")).font(.custom("Satoshi-Regular", size: 14, relativeTo: .subheadline))
          }
          .foregroundStyle(palette.foreground).padding()
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
          .padding(.horizontal, 20)
        }
        filterStrip(scene, palette: palette).padding(.horizontal, 20)
      }
      tabBar
    }
    .buttonStyle(HomeChromePressStyle())
  }

  @ViewBuilder
  private func filterStrip(_ scene: MapScene, palette: HomeChromePalette) -> some View {
    if scene.showsWentSwitch || !scene.chips.isEmpty {
      ScrollView(.horizontal) {
        HStack(spacing: 8) {
          if scene.showsWentSwitch {
            wentChip(.all, "map.filterAll", palette: palette)
            wentChip(.want, "passport.wantToGo", palette: palette)
            wentChip(.went, "passport.wentNoDate", palette: palette)
          }
          ForEach(scene.chips, id: \.self) { kind in
            filterChip(copy(kind.labelKey), selected: filters.kinds.contains(kind), palette: palette) {
              if filters.kinds.insert(kind).inserted {
                Analytics.capture("map_filter_selected", ["kind": kind.rawValue])
              } else { filters.kinds.remove(kind) }
            }
          }
        }
      }.scrollIndicators(.hidden)
    }
  }

  private func searchPanel(_ scene: MapScene, palette: HomeChromePalette) -> some View {
    VStack(spacing: 8) {
      HStack(spacing: 8) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").accessibilityHidden(true)
          TextField(copy("map.searchPlaceholder"), text: $filters.search)
            .focused($focusedSearch).submitLabel(.search).autocorrectionDisabled()
            .onSubmit { focusedSearch = false }
            .onChange(of: focusedSearch) { if focusedSearch { resultsOpen = true } }
        }
        .padding(.horizontal, 16).frame(minHeight: 52)
        .background(palette.surface, in: Capsule())
        .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5) }
        Button(copy("common.cancel")) {
          searching = false
          focusedSearch = false
          filters.search = ""
        }.padding(.horizontal, 12).frame(minHeight: 44)
          .background(palette.surface, in: Capsule())
      }
      filterStrip(scene, palette: palette)
      retryControl(palette)
      if scene.filters.hasSearch && resultsOpen && (!scene.visible.isEmpty || errors.isEmpty) {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(scene.visible.prefix(5)) { place in
            Button {
              Analytics.capture("map_search_result_opened")
              focusedSearch = false
              resultsOpen = false
              selected = place
            } label: {
              Label(place.name, systemImage: place.isSaved ? "bookmark" : "mappin")
                .lineLimit(1).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
          }
          if scene.visible.isEmpty {
            Text(copy("map.searchNoResults", ["query": filters.search])).font(.caption)
              .padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: palette.shadow.opacity(0.12), radius: 4, y: 2)
      }
    }
    .font(.custom("Satoshi-Regular", size: 16, relativeTo: .body))
    .foregroundStyle(palette.foreground)
    .buttonStyle(HomeChromePressStyle())
    .padding(.horizontal, 20)
    .onChange(of: filters) { resultsOpen = true }
    .task { focusedSearch = true }
  }

  @ViewBuilder
  private func retryControl(_ palette: HomeChromePalette) -> some View {
    if !errors.isEmpty {
      Button(copy("common.retry")) { retry += 1 }
        .padding(.horizontal, 12).frame(minHeight: 44)
        .background(palette.surface, in: Capsule())
    }
  }

  private func roundButton(_ symbol: String, label: String, palette: HomeChromePalette,
    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol).font(.system(size: 17, weight: .medium))
        .foregroundStyle(palette.foreground)
        .frame(width: 40, height: 40).background(palette.surface, in: Circle())
        .shadow(color: palette.shadow.opacity(0.20), radius: 3, y: 2)
        .frame(width: 44, height: 44).contentShape(Rectangle())
    }.accessibilityLabel(label)
  }

  private func wentChip(_ value: WentFilter, _ title: String, palette: HomeChromePalette) -> some View {
    filterChip(copy(title), selected: filters.went == value, palette: palette) { filters.went = value }
  }

  private func filterChip(_ title: String, selected: Bool, palette: HomeChromePalette,
    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title).font(.custom("Satoshi-Bold", size: 13, relativeTo: .footnote))
        .foregroundStyle(selected ? palette.background : palette.foreground)
        .padding(.horizontal, 11).padding(.vertical, 6)
        .background(selected ? palette.foreground : palette.frame, in: Capsule())
        .overlay { Capsule().strokeBorder(selected ? palette.foreground : palette.border, lineWidth: 0.5) }
        .shadow(color: palette.shadow.opacity(0.12), radius: 4, y: 2)
        .frame(minHeight: 44).contentShape(Rectangle())
    }.accessibilityAddTraits(selected ? .isSelected : [])
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

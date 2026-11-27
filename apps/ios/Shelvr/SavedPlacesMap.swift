import CoreLocation
import MapKit
import ShelvrKit
import SwiftUI

struct SavedPlacesMap: View {
  let open: (String) -> Void
  @Binding var cityInView: String?
  let searchFocusChanged: (Bool) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var typeSize
  @AppStorage("swift.appearance") private var appearance = "system"
  @ScaledMetric(relativeTo: .body) private var searchControlHeight: CGFloat = 44
  @State private var saved: [MapPlace]?
  @State private var discoverResponse: AreaResponse?
  @State private var catalogResponse: CatalogResponse?
  @State private var failedCatalogRequest: CatalogRequest?
  @State private var catalogGeneration = UUID()
  @State private var visits: [MapVisit] = []
  @State private var discoverRequest = AreaRequest(area: .world)
  @State private var filters = MapFilters()
  @State private var location = MapLocation()
  @State private var selectedLabelID: String?
  @State private var pinSheet: PinSheet?
  @State private var errors = Set<String>()
  @State private var retry = 0
  @State private var viewport: MapViewport?
  @State private var cameraCommand: MapCameraCommand?
  @State private var topControlsHeight: CGFloat = 50
  @State private var bottomControlsHeight: CGFloat = 48
  @State private var locateFrame: CGRect?
  @State private var searching = false
  @State private var resultsOpen = true
  @State private var reportedOpen = false
  @FocusState private var focusedSearch: Bool

  private enum PinSheet: Identifiable {
    case cluster([MapPlace]), place(MapPlace)

    var id: String {
      switch self {
      case .cluster: "cluster"
      case .place(let place): place.id
      }
    }
  }

  var body: some View {
    let request = discoverRequest
    let discover = discoverResponse?.places ?? []
    let complete = discoverResponse?.request == request ? discoverResponse?.complete : nil
    let search = catalogRequest
    let catalog = catalogResponse?.request == search ? catalogResponse?.results : nil
    let catalogFailed = search != nil && failedCatalogRequest == search
    let scene = MapScene(saved: saved, discover: discover, visits: visits, filters: filters, catalog: catalog?.places ?? [])
    let palette = HomeChromePalette(scheme, appearance: appearance)
    let personalPlaces = saved ?? []
    let overviewPlaces = scene.visible.filter(\.isSaved)
    MapCanvas(places: scene.visible, cameraCommand: cameraCommand, filters: scene.filters, opening: scene.opening,
      visited: scene.visited, selectedLabelID: selectedLabelID, copy: copy, topControlsHeight: topControlsHeight,
      bottomControlsHeight: focusedSearch ? 0 : bottomControlsHeight, locateFrame: searching ? nil : locateFrame,
      onArea: { updateDiscoverArea($0); viewport = $1 },
      onUserMove: cancelCameraRequests, onPick: selectPlace, onCluster: { pinSheet = .cluster($0) })
      .ignoresSafeArea(.container)
      .overlay(alignment: .top) {
        Group {
          if searching {
            searchPanel(scene, palette: palette,
              catalogLoading: search != nil && catalog == nil && !catalogFailed, catalogFailed: catalogFailed,
              showAttribution: catalog?.includesOverture == true)
          }
          else { mapHeader(personalPlaces: personalPlaces, overviewPlaces: overviewPlaces, palette: palette) }
        }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { topControlsHeight = $0 }
      }
      .overlay(alignment: .bottom) {
        if !focusedSearch {
          mapFooter(scene, complete: complete, discoverIsEmpty: discover.isEmpty, palette: palette)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bottomControlsHeight = $0 }
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if !searching {
          roundButton("location", label: copy("map.showMyLocation"), palette: palette) { location.locate() }
            .buttonStyle(HomeChromePressStyle())
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { locateFrame = $0 }
            .padding(.trailing, 20)
            .padding(.bottom, bottomControlsHeight + 8)
        }
      }
      .onChange(of: viewport?.city(among: personalPlaces), initial: true) { _, city in cityInView = city }
      .onChange(of: location.latestFix?.id) {
        if let fix = location.latestFix { moveCamera(.locate(fix.coordinate)) }
      }
      .onChange(of: focusedSearch) { _, focused in searchFocusChanged(focused) }
      .onChange(of: saved != nil && (discoverResponse != nil || errors.contains("discover")), initial: true) { _, settled in
        guard settled, !reportedOpen, let saved else { return }
        reportedOpen = true
        let status = CLLocationManager().authorizationStatus
        Analytics.capture("map_opened", ["count": saved.count, "discover": discover.count,
          "located": status == .authorizedWhenInUse || status == .authorizedAlways,
          "opening": saved.isEmpty ? "default" : "fit"])
      }
      .onDisappear { searchFocusChanged(false) }
      .alert(copy("common.unavailable"), isPresented: $location.unavailable) {
        Button(copy("common.close")) {}
      }
      .sheet(item: $pinSheet) { destination in
        switch destination {
        case .cluster(let places):
          List(places) { place in Button(place.name) { selectPlace(place) } }
            .presentationDetents([.medium, .large])
        case .place(let place):
          let places = place.isSaved ? personalPlaces : discover
          let hours = places.first { $0.id == place.id }?.todayHours
          MapPlaceSheet(place: place, todayHours: hours)
        }
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
      .task(id: request) {
        await subscribe("discover") {
          for try await page in backend.discover(in: request.area) {
            try Task.checkCancellation()
            discoverResponse = AreaResponse(request: request, places: page.places, complete: page.complete)
          }
        }
      }
      .task(id: search) { await searchCatalog(search) }
  }

  private func selectPlace(_ place: MapPlace) {
    guard backend.userID != nil else { return }
    cancelCameraRequests()
    selectedLabelID = place.id
    Analytics.capture("map_place_opened", ["card": true, "source": place.isSaved ? "own" : "discover"])
    pinSheet = .place(place)
  }

  private func mapHeader(personalPlaces: [MapPlace], overviewPlaces: [MapPlace],
    palette: HomeChromePalette) -> some View {
    let city = viewport?.city(among: personalPlaces)
    return VStack(spacing: 6) {
      HStack(spacing: 12) {
        if let city {
          cityControl(city, overviewPlaces: overviewPlaces, palette: palette)
        } else {
          Text("shelvr").font(.custom("CrimsonProRoman-Regular", size: 28, relativeTo: .title2))
            .tracking(0.5)
        }
        Spacer(minLength: 0)
        roundButton("magnifyingglass", label: copy("map.searchPlaceholder"), palette: palette) {
          searching = true
          resultsOpen = true
        }
      }
      .frame(minHeight: 50)
      retryControl(palette)
    }
    .padding(.horizontal, 20)
    .foregroundStyle(palette.foreground)
    .buttonStyle(HomeChromePressStyle())
  }

  @ViewBuilder
  private func cityControl(_ city: String, overviewPlaces: [MapPlace], palette: HomeChromePalette) -> some View {
    if overviewPlaces.contains(where: { place in
      guard let other = place.city, !other.isEmpty else { return false }
      return other.caseInsensitiveCompare(city) != .orderedSame
    }) {
      Menu {
        Button { openCity(city) } label: { Label(city, systemImage: "building.2") }
        Button {
          location.cancel()
          moveCamera(.overview(overviewPlaces))
        } label: {
          Label(copy("map.showAllCities"), systemImage: "map")
        }
      } label: {
        cityTitle(city, palette: palette, showsMenu: true)
      }
    } else {
      Button { openCity(city) } label: { cityTitle(city, palette: palette, showsMenu: false) }
    }
  }

  private func cityTitle(_ city: String, palette: HomeChromePalette, showsMenu: Bool) -> some View {
    HStack(spacing: 6) {
      Text(city).font(.custom("Satoshi-Bold", size: 30, relativeTo: .largeTitle))
        .tracking(-0.75).lineLimit(1).minimumScaleFactor(0.6)
        .layoutPriority(1)
      if showsMenu {
        Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
          .foregroundStyle(palette.muted).accessibilityHidden(true)
      }
    }
    .shadow(color: palette.frame, radius: 4)
    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
    .contentShape(Rectangle())
  }

  private func openCity(_ city: String) {
    if let encoded = city.addingPercentEncoding(withAllowedCharacters: .alphanumerics) { open("/city/" + encoded) }
  }

  private func mapFooter(_ scene: MapScene, complete: Bool?, discoverIsEmpty: Bool,
    palette: HomeChromePalette) -> some View {
    VStack(spacing: 6) {
      if !searching {
        if complete == false, scene.filters.went == .all, !errors.contains("discover") {
          Text(copy("map.discoverZoomHint"))
            .font(.custom("Satoshi-Bold", size: 13, relativeTo: .footnote))
            .multilineTextAlignment(.center)
            .foregroundStyle(palette.foreground)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(palette.frame, in: Capsule())
            .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5) }
            .padding(.horizontal, 20)
        } else if saved?.isEmpty == true, complete == true, discoverIsEmpty, errors.isEmpty {
          VStack(alignment: .leading) {
            Text(copy("map.emptyTitle")).font(.custom("Satoshi-Bold", size: 16, relativeTo: .headline))
            Text(copy("map.emptyBody")).font(.custom("Satoshi-Regular", size: 14, relativeTo: .subheadline))
          }
          .foregroundStyle(palette.foreground).padding()
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
          .padding(.horizontal, 20)
        }
      }
      filterStrip(scene, palette: palette)
    }
    .buttonStyle(HomeChromePressStyle())
  }

  @ViewBuilder
  private func filterStrip(_ scene: MapScene, palette: HomeChromePalette) -> some View {
    let showClear = filters.kinds.count > 1
    let scrollClear = showClear && typeSize.isAccessibilitySize
    let pinClear = showClear && !scrollClear
    let hasActions = pinClear || scene.showsWentSwitch
    if showClear || hasActions || !scene.chips.isEmpty {
      HStack(spacing: 5) {
        ScrollView(.horizontal) {
          HStack(spacing: 5) {
            ForEach(scene.chips, id: \.self) { kind in
              let selected = filters.kinds.contains(kind)
              Button {
                var next = filters
                if next.kinds.insert(kind).inserted {
                  Analytics.capture("map_filter_selected", ["kind": kind.rawValue])
                } else { next.kinds.remove(kind) }
                applyFilters(next)
              } label: {
                chipLabel(copy(kind.labelKey), symbol: categorySymbol(kind), selected: selected,
                  palette: palette, color: Color(uiColor: MapPinPalette.color(for: kind)))
              }.accessibilityAddTraits(selected ? .isSelected : [])
            }
            if scrollClear { clearCategoryButton(palette) }
          }
          .padding(.vertical, 2)
        }
        .contentMargins(.leading, 14, for: .scrollContent)
        .contentMargins(.trailing, hasActions ? 3 : 14, for: .scrollContent)
        .scrollIndicators(.hidden)
        .accessibilityLabel(copy("map.filters"))
        if hasActions {
          HStack(spacing: 5) {
            if pinClear { clearCategoryButton(palette) }
            if scene.showsWentSwitch { visitStatusMenu(scene.filters.went, palette: palette) }
          }
          .padding(.trailing, 14)
        }
      }
    }
  }

  private func searchPanel(_ scene: MapScene, palette: HomeChromePalette, catalogLoading: Bool,
    catalogFailed: Bool, showAttribution: Bool) -> some View {
    let controlHeight = max(44, searchControlHeight)
    return VStack(spacing: 8) {
      HStack(spacing: 8) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").accessibilityHidden(true)
          TextField(copy("map.searchPlaceholder"), text: Binding(
            get: { filters.search },
            set: { updateSearch($0) }))
            .focused($focusedSearch).submitLabel(.search).autocorrectionDisabled()
            .onSubmit { focusedSearch = false }
            .onChange(of: focusedSearch) { if focusedSearch { resultsOpen = true } }
        }
        .padding(.horizontal, 16).frame(minHeight: controlHeight)
        .background(palette.surface, in: Capsule())
        .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5) }
        Button {
          searching = false
          focusedSearch = false
          updateSearch("")
        } label: {
          Text(copy("common.cancel"))
            .padding(.horizontal, 12).frame(minHeight: controlHeight)
            .background(palette.surface, in: Capsule())
            .overlay { Capsule().strokeBorder(palette.border, lineWidth: 0.5).allowsHitTesting(false) }
            .contentShape(Capsule())
        }
      }
      .frame(minHeight: 50)
      if focusedSearch { filterStrip(scene, palette: palette).padding(.horizontal, -20) }
      retryControl(palette, catalogFailed: catalogFailed)
      if showAttribution, !scene.visible.isEmpty, let url = URL(string: "https://docs.overturemaps.org/attribution/") {
        Link("Overture Maps", destination: url)
          .font(.caption)
          .foregroundStyle(palette.muted)
          .padding(.horizontal, 12)
          .frame(minHeight: 44)
          .background(palette.surface, in: Capsule())
          .frame(maxWidth: .infinity, alignment: .leading)
          .layoutPriority(1)
      }
      if scene.filters.hasSearch && resultsOpen && (!scene.visible.isEmpty || (errors.isEmpty && !catalogFailed)) {
        let results = VStack(alignment: .leading, spacing: 0) {
          ForEach(scene.visible.prefix(5)) { place in
            Button {
              Analytics.capture("map_search_result_opened")
              focusedSearch = false
              resultsOpen = false
              selectPlace(place)
              if !place.isSaved { moveCamera(.overview([place])) }
            } label: {
              HStack(spacing: 8) {
                Image(systemName: place.isSaved ? "bookmark" : "mappin").accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                  Text(place.name).lineLimit(1)
                  if !place.isSaved, let city = place.city {
                    Text(city).font(.caption).foregroundStyle(palette.muted).lineLimit(1)
                  }
                }
              }
              .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
              .contentShape(Rectangle())
            }
          }
          if scene.visible.isEmpty {
            if catalogLoading {
              ProgressView(copy("common.loading")).font(.caption).padding(.vertical, 8)
            } else {
              Text(copy("map.searchNoResults", ["query": filters.search])).font(.caption)
                .padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
        ViewThatFits(in: .vertical) {
          results
          ScrollView { results }.scrollBounceBehavior(.basedOnSize)
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
  private func retryControl(_ palette: HomeChromePalette, catalogFailed: Bool = false) -> some View {
    if !errors.isEmpty || catalogFailed {
      Button(copy("common.retry")) {
        retry += 1
        discoverRequest = AreaRequest(area: discoverRequest.area)
      }
        .padding(.horizontal, 12).frame(minHeight: 44)
        .background(palette.surface, in: Capsule())
    }
  }

  private func roundButton(_ symbol: String, label: String, palette: HomeChromePalette,
    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol).font(.system(size: 17, weight: .medium))
        .foregroundStyle(palette.foreground)
        .frame(width: 44, height: 44).background(palette.surface, in: Circle())
        .shadow(color: palette.shadow.opacity(0.20), radius: 3, y: 2)
        .contentShape(Rectangle())
    }.accessibilityLabel(label)
  }

  private func visitStatusMenu(_ scope: WentFilter, palette: HomeChromePalette) -> some View {
    let (title, symbol) = switch scope {
    case .all: (copy("map.filterAll"), "clock")
    case .want: (copy("passport.wantToGo"), "bookmark.fill")
    case .went: (copy("passport.wentNoDate"), "checkmark.circle.fill")
    }
    return Menu {
      Button { setWentFilter(.all) } label: {
        Label(copy("map.filterAll"), systemImage: scope == .all ? "checkmark" : "map")
      }
      Button { setWentFilter(.want) } label: {
        Label(copy("passport.wantToGo"), systemImage: scope == .want ? "checkmark" : "bookmark")
      }
      Button { setWentFilter(.went) } label: {
        Label(copy("passport.wentNoDate"), systemImage: scope == .went ? "checkmark" : "checkmark.circle")
      }
    } label: {
      chipLabel(nil, symbol: symbol, selected: scope != .all, palette: palette, chevron: true)
    }
    .accessibilityLabel(copy("map.visitStatus"))
    .accessibilityValue(title)
  }

  private func clearCategoryFilters() {
    var next = filters
    next.kinds = []
    applyFilters(next)
  }

  private func clearCategoryButton(_ palette: HomeChromePalette) -> some View {
    Button(action: clearCategoryFilters) {
      chipLabel(copy("map.clearCategoryFilters"), symbol: "xmark", selected: false, palette: palette)
    }
  }

  private func setWentFilter(_ value: WentFilter) {
    var next = filters
    next.went = value
    applyFilters(next)
  }

  private func categorySymbol(_ kind: PlaceKind) -> String {
    switch kind {
    case .food: "fork.knife"
    case .coffee: "cup.and.saucer.fill"
    case .dessert: "birthday.cake.fill"
    case .drinks: "wineglass.fill"
    case .dateNight: "heart.fill"
    case .activities: "ticket.fill"
    case .shopping: "bag.fill"
    case .stay: "bed.double.fill"
    }
  }

  private func cancelCameraRequests() {
    location.cancel()
    cameraCommand?.cancel()
  }

  private func moveCamera(_ action: MapCameraCommand.Action, refitWhenCatalogArrives: Bool = false) {
    cameraCommand?.cancel()
    cameraCommand = .init(action: action, refitWhenCatalogArrives: refitWhenCatalogArrives)
  }

  private func updateSearch(_ text: String) {
    guard filters.search != text else { return }
    catalogGeneration = UUID()
    var next = filters
    next.search = text
    applyFilters(next)
  }

  private func applyFilters(_ next: MapFilters) {
    guard filters != next else { return }
    location.cancel()
    filters = next
    selectedLabelID = nil
    let request = catalogRequest
    moveCamera(.fitFilteredPlaces, refitWhenCatalogArrives: request != nil && catalogResponse?.request != request)
  }

  private func chipLabel(_ title: String?, symbol: String, selected: Bool, palette: HomeChromePalette,
    color: Color? = nil, chevron: Bool = false) -> some View {
    let glyph = color.map { scheme == .dark ? $0.mix(with: palette.foreground, by: 0.55) : $0 }
    return HStack(spacing: 4) {
      Image(systemName: symbol)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(glyph ?? palette.foreground)
        .frame(width: 18)
        .accessibilityHidden(true)
      if let title {
        Text(title).font(.custom("Satoshi-Bold", size: 13, relativeTo: .footnote))
          .fixedSize(horizontal: true, vertical: false)
      }
      if chevron {
        Image(systemName: "chevron.down")
          .font(.system(size: 8, weight: .bold))
          .accessibilityHidden(true)
      }
    }
    .foregroundStyle(palette.foreground)
    .padding(.horizontal, 8).padding(.vertical, 4)
    .frame(minHeight: 30)
    .background {
      Capsule().fill(palette.surface)
      if selected { Capsule().fill(Color("AccentColor").opacity(0.24)) }
    }
    .overlay {
      Capsule().strokeBorder(selected ? palette.primaryText : palette.border,
        lineWidth: selected ? 1.25 : 0.5)
    }
    .shadow(color: palette.shadow.opacity(0.14), radius: 3, y: 2)
    .frame(minHeight: 44).contentShape(Rectangle())
  }

  private func updateDiscoverArea(_ area: DiscoverBox) {
    guard area != discoverRequest.area else { return }
    discoverRequest = AreaRequest(area: area)
  }

  private struct AreaRequest: Equatable {
    let area: DiscoverBox
    let generation = UUID()
  }

  private struct AreaResponse {
    let request: AreaRequest
    let places: [MapPlace]
    let complete: Bool
  }

  private struct CatalogRequest: Equatable {
    let text: String
    let generation: UUID
    let session: UUID
    let retry: Int
  }

  private struct CatalogResponse {
    let request: CatalogRequest
    let results: Backend.CatalogPlaces
  }

  private var catalogRequest: CatalogRequest? {
    let text = filters.search.trimmingCharacters(in: .whitespacesAndNewlines)
    guard searching, !text.isEmpty else { return nil }
    if filters.went != .all, !MapVisit.visitedIDs(visits, among: saved ?? []).isEmpty { return nil }
    return CatalogRequest(text: text, generation: catalogGeneration, session: backend.sessionGeneration, retry: retry)
  }

  private func searchCatalog(_ request: CatalogRequest?) async {
    guard let request else { return }
    do {
      try await Task.sleep(for: .milliseconds(250))
      for try await results in backend.catalogPlaces(matching: request.text) {
        try Task.checkCancellation()
        guard request == catalogRequest else { return }
        catalogResponse = CatalogResponse(request: request, results: results)
        failedCatalogRequest = nil
        if cameraCommand?.takeCatalogRefit() == true { moveCamera(.fitFilteredPlaces) }
      }
    } catch {
      if !Task.isCancelled, request == catalogRequest { failedCatalogRequest = request }
    }
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

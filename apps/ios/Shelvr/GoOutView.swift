import MapKit
import ShelvrKit
import SwiftUI

struct GoOutView: View {
  let city: String
  let listID: String?
  let plan: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.colorScheme) private var scheme
  @AppStorage("swift.appearance") private var appearance = "system"
  @State private var picking = false
  @State private var mapped: [GoOutPlace]?
  @State private var citySaves: [LibrarySave]?
  private var places: [GoOutPlace]? {
    guard let mapped else { return nil }
    if listID == nil && !city.isEmpty && mapped.contains(where: { $0.city == nil }) && citySaves == nil { return nil }
    return GoOutPlace.distinct(mapped, city: city, citySaves: citySaves ?? [])
  }
  @State private var kind: String?
  @State private var current: GoOutPlace?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    VStack(spacing: 0) {
      if picking { spotPicker }
      else { planCards }
    }
    .navigationTitle(copy(picking ? "goOut.question" : "plan.goOut"))
    .task(id: attempt) {
      guard listID == nil, !city.isEmpty else { return }
      do {
        for try await saves in backend.citySaves(city) { citySaves = saves }
      } catch { if !Task.isCancelled { failed = true } }
    }
    .task(id: attempt) {
      do {
        if let listID {
          for try await list in backend.goOutList(listID) { mapped = list?.places ?? [] }
        } else {
          for try await all in backend.query("mapPlaces:listMapPlaces", as: [GoOutPlace].self) {
            mapped = all
          }
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private var planCards: some View {
    let palette = HomeChromePalette(scheme, appearance: appearance)
    return ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if !city.isEmpty {
          Label(city, systemImage: "mappin")
            .font(.custom("Satoshi-Bold", size: 15, relativeTo: .subheadline))
            .foregroundStyle(palette.muted)
            .padding(.bottom, 2)
        }
        HomeActionCard(title: copy("homePlaces.planDate"), detail: copy("goOut.dateDetail"),
          symbol: "heart.fill", palette: palette) { plan("/date-plan") }
        HomeActionCard(title: copy("homePlaces.planTrip"), detail: copy("goOut.tripDetail"),
          symbol: "suitcase.fill", palette: palette) { plan("/new-trip") }
        HomeActionCard(title: copy("goOut.quickPick"), detail: copy("goOut.quickPickBody"),
          symbol: "dice.fill", palette: palette, emphasis: .secondary) { picking = true }
          .padding(.top, 4)
      }
      .padding(.horizontal, 20)
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .background(palette.background.ignoresSafeArea())
  }

  private var spotPicker: some View {
    List {
      if failed { Button(copy("common.retry")) { failed = false; attempt += 1 } }
      else if let places {
        let candidates = places.filter { $0.matches(kind) }
        Picker(copy("map.filters"), selection: $kind) {
          Text(copy("goOut.any")).tag(nil as String?)
          ForEach(["food", "drinks", "activities", "shopping"], id: \.self) { kind in
            Text(copy("map.kind\(kind.capitalized)")).tag(Optional(kind))
          }
        }.onChange(of: kind) { current = nil }
        if let current, candidates.contains(current) {
          Text(current.name).font(.title2)
          Button(copy("plan.openMaps")) {
            let map = MKMapItem(placemark: .init(coordinate: .init(latitude: current.lat, longitude: current.lng)))
            map.name = current.name; map.openInMaps()
          }
        }
        Button(copy(current == nil ? "goOut.roll" : "goOut.rollAgain")) { current = GoOutPlace.rolled(candidates, previous: current) }
          .disabled(candidates.isEmpty)
        if candidates.isEmpty { Text(copy("plan.emptyTitle")) }
      } else { ProgressView() }
      Button(copy("common.back")) { picking = false }
    }
  }
}

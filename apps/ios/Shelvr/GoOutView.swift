import MapKit
import ShelvrKit
import SwiftUI

struct GoOutView: View {
  let city: String
  let listID: String?
  let plan: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var picking = false
  @State private var places: [GoOutPlace]?
  @State private var kind: String?
  @State private var current: GoOutPlace?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    List {
      if picking {
        if failed { Button(copy("common.retry")) { attempt += 1 } }
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
      } else {
        Button(copy("homePlaces.planDate")) { plan("/date-plan") }
        Button(copy("homePlaces.planTrip")) { plan("/new-trip") }
        Button(copy("goOut.quickPick")) { picking = true }
      }
    }
    .navigationTitle(copy(picking ? "goOut.question" : "plan.goOut"))
    .task(id: attempt) {
      failed = false
      do {
        if let listID {
          for try await list in backend.goOutList(listID) { places = GoOutPlace.distinct(list?.places ?? [], city: city) }
        } else {
          for try await all in backend.query("mapPlaces:listMapPlaces", as: [GoOutPlace].self) {
            places = GoOutPlace.distinct(all, city: city)
          }
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

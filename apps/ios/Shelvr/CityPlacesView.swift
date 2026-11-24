import MapKit
import ShelvrKit
import SwiftUI

struct CityPlacesView: View {
  let city: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var saves: [LibrarySave]?
  @State private var selected: CityPlace?
  @State private var attempt = 0
  @State private var failed = false

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let saves {
        let pins = CityPlace.pins(in: saves)
        List {
          if !pins.isEmpty {
            Map(selection: $selected) {
              ForEach(pins) { pin in
                Marker(pin.name, coordinate: .init(latitude: pin.lat, longitude: pin.lng)).tag(pin)
              }
            }.frame(height: 245).listRowInsets(.init())
            if let selected, pins.contains(selected), let link = AppLink("/item/" + selected.itemID) {
              NavigationLink(selected.name, value: link)
            }
            planLink("/go-out", "plan.goOut", "figure.walk")
            planLink("/new-trip", "homePlaces.planTrip", "suitcase")
          }
          ForEach(pins) { pin in
            if let link = AppLink("/item/" + pin.itemID) {
              NavigationLink(value: link) { Label(pin.name, systemImage: "mappin") }
            }
          }
          ForEach(CityPlace.remainingSaves(saves, pins: pins)) { save in
            if let link = AppLink("/item/" + save.id) {
              NavigationLink(value: link) { LibrarySaveRow(save: save) }
            }
          }
          if saves.isEmpty {
            ContentUnavailableView(copy("cityMap.noPlacesLeft"), systemImage: "mappin.slash",
              description: Text(copy("cityMap.noPlacesLeftBody", ["city": city])))
          }
        }
      } else { ProgressView() }
    }
    .navigationTitle(city)
    .task(id: attempt) {
      failed = false
      do {
        for try await saves in backend.citySaves(city) { self.saves = saves }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private func planLink(_ route: String, _ key: String, _ symbol: String) -> some View {
    var parts = URLComponents()
    parts.path = route
    parts.queryItems = [URLQueryItem(name: "city", value: city)]
    return Group {
      if let link = parts.string.flatMap({ AppLink($0) }) {
        NavigationLink(value: link) { Label(copy(key), systemImage: symbol) }
      }
    }
  }
}

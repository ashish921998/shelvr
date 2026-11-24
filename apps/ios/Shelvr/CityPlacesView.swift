import MapKit
import ShelvrKit
import SwiftUI

struct CityPlacesView: View {
  let city: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var saves: [LibrarySave]?
  @State private var marks: [MapVisit]?
  @State private var visitFailure = false
  @State private var operation = SocialOperation()
  @State private var selected: CityPlace?
  @State private var attempt = 0
  @State private var failed = false

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let saves {
        let pins = CityPlace.pins(in: saves)
        let went = CityPlace.visited(marks ?? [], among: pins)
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
            planLink("/city-card", "cityCard.share", "square.and.arrow.up")
            CityVotesView(city: city, pins: pins)
            planLink("/date-plan", "homePlaces.planDate", "heart")
            planLink("/new-trip", "homePlaces.planTrip", "suitcase")
          }
          ForEach(pins) { pin in
            if let link = AppLink("/item/" + pin.itemID) {
              HStack {
                NavigationLink(value: link) { Label(pin.name, systemImage: "mappin") }
                if marks != nil, !visitFailure {
                  Button {
                    let next = !went.contains(pin)
                    operation.run { try await backend.changeVisit(pin, went: next) }
                  } label: {
                    Image(systemName: went.contains(pin) ? "checkmark.seal.fill" : "seal").frame(width: 44, height: 44)
                  }.buttonStyle(.borderless).disabled(operation.busy)
                    .accessibilityLabel(went.contains(pin) ? copy("cityProgress.unmarkVisited", ["name": pin.name]) : copy("passport.stampPlaceLabel", ["name": pin.name]))
                    .accessibilityAddTraits(went.contains(pin) ? .isSelected : [])
                }
              }
            }
          }
          if visitFailure { Button(copy("common.retry")) { attempt += 1 } }
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
    .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
    .task(id: attempt) {
      marks = nil
      visitFailure = false
      do {
        for try await next in backend.query("placeVisits:listVisits", as: [MapVisit].self) {
          try Task.checkCancellation()
          marks = next
        }
      } catch { if !Task.isCancelled { visitFailure = true } }
    }
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

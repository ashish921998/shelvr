import ShelvrKit
import SwiftUI

struct LibraryPlaceEditor: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var original: SavePlaces?
  @State private var places: [EditablePlace] = []
  @State private var city = ""
  @State private var query = ""
  @State private var replacing: Int?
  @State private var matches: [EditablePlace] = []
  @State private var busy = false
  @State private var message = ""
  @State private var attempt = 0

  var body: some View {
    Group {
      if let original {
        Form {
          Section {
            ForEach(Array(places.enumerated()), id: \.offset) { index, place in
              VStack(alignment: .leading) {
                Text(place.name)
                if let city = place.city { Text(city).font(.caption) }
                HStack {
                  Button(copy("placeCorrection.replace")) {
                    replacing = index
                    city = place.city ?? ""
                    query = place.name
                    matches = []
                  }
                  Button(copy("placeCorrection.remove"), role: .destructive) {
                    places.remove(at: index)
                    clearSearch()
                  }
                }.buttonStyle(.borderless)
              }
            }
          } footer: { Text(copy("placeCorrection.hint")) }
          Section {
            TextField(copy("placeCorrection.city"), text: $city)
            TextField(copy("placeCorrection.search"), text: $query)
            Button(copy("placeCorrection.search")) { Task { await search() } }
              .disabled(city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
            ForEach(Array(matches.enumerated()), id: \.offset) { _, place in
              Button(place.name) {
                if let index = replacing { places[index] = place } else { places.append(place) }
                clearSearch()
              }
            }
            if replacing != nil { Button(copy("common.cancel")) { clearSearch() } }
          }
          Button(copy("placeCorrection.save")) { Task { await commit(original) } }
            .disabled(places == original.places)
          if !message.isEmpty { Text(message).foregroundStyle(.secondary) }
        }.disabled(busy)
      } else if !message.isEmpty {
        VStack { Text(message); Button(copy("common.retry")) { attempt += 1 } }
      } else { ProgressView() }
    }
    .navigationTitle(copy("placeCorrection.title"))
    .onChange(of: city) { matches = [] }
    .onChange(of: query) { matches = [] }
    .task(id: attempt) {
      message = ""
      do {
        for try await value in backend.placesForSave(id) {
          guard !Task.isCancelled else { return }
          guard let value, value.ready else {
            message = copy(value == nil ? "common.unavailable" : "placeCorrection.wait")
            return
          }
          original = value
          places = value.places
          city = places.first?.city ?? ""
          return
        }
      } catch { if !Task.isCancelled { message = copy("errors.retrySoon") } }
    }
  }

  private func clearSearch() {
    query = ""
    matches = []
    replacing = nil
    message = ""
  }

  private func search() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    matches = []
    message = ""
    do {
      let result = try await backend.findPlace(query, city: city, id: id)
      matches = result.places.map { candidate in
        var place = candidate
        place.city = city.trimmingCharacters(in: .whitespacesAndNewlines)
        return place
      }
      if matches.isEmpty {
        message = copy(result.available ? "tripPlanner.searchEmpty" : "tripPlanner.searchUnavailable")
      }
    } catch { message = copy("errors.retrySoon") }
  }

  private func commit(_ original: SavePlaces) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      try await backend.savePlaces(places, version: original.version, id: id)
      dismiss()
    } catch { message = copy("placeCorrection.retry") }
  }
}

import ShelvrKit
import SwiftUI

struct AddTripStopView: View {
  let id: String
  private let sharedTrip: CityTrip?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var trip: CityTrip?
  @State private var saves: [TripSavePlace]?
  @State private var day: Int
  @State private var query = ""
  @State private var found: [TripSearchPlace] = []
  @State private var session = 0
  @State private var failed = false
  @State private var searchMessage = ""
  @State private var busy = false
  @State private var adding: Task<Void, Never>?

  init(id: String, initialDay: Int, sharedTrip: CityTrip? = nil) {
    self.id = id
    self.sharedTrip = sharedTrip
    _day = State(initialValue: initialDay)
  }

  var body: some View {
    let visibleTrip = sharedTrip ?? trip
    let visibleSaves = sharedTrip == nil ? saves : []
    Group {
      if failed { Button(copy("common.retry")) { session += 1 } }
      else if let trip = visibleTrip, let saves = visibleSaves {
        List {
          Picker(copy("tripPlanner.addTo"), selection: $day) {
            ForEach(0...trip.days.count, id: \.self) { day in Text(dayLabel(day)).tag(day) }
          }
          TextField(copy("tripPlanner.searchPlaceholder", ["city": trip.city]), text: $query)
          ForEach(Array(saves.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }.enumerated()), id: \.offset) { _, place in
            Button(place.name) { add(.saved(place)) }
          }
          ForEach(Array(found.enumerated()), id: \.offset) { _, place in
            Button { add(.search(place)) } label: { VStack(alignment: .leading) {
              Text(place.name)
              if TripEdit.alreadyOnTrip(place, trip: trip) { Text(copy("tripPlanner.onTrip")).font(.caption) }
              if let area = place.area { Text(area).font(.caption) }
            } }
          }
          if !searchMessage.isEmpty { Text(searchMessage) }
        }.disabled(busy)
      } else { ProgressView() }
    }
    .navigationTitle(copy("tripPlanner.addPlace"))
    .onChange(of: sharedTrip?.days.count, initial: true) { _, count in
      if let count { day = TripEdit.day(day, count: count) }
    }
    .task(id: session) {
      guard sharedTrip == nil else { return }
      failed = false
      do {
        for try await data in backend.cityTrip(id) {
          try Task.checkCancellation()
          guard let data else { failed = true; return }
          day = TripEdit.day(day, count: data.days.count)
          trip = data
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
    .task(id: session) {
      guard sharedTrip == nil else { return }
      do {
        for try await saves in backend.tripSavePlaces(id) {
          try Task.checkCancellation()
          self.saves = saves
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
    .task(id: query) {
      found = []
      searchMessage = ""
      let phrase = query.trimmingCharacters(in: .whitespacesAndNewlines)
      guard phrase.count >= 2 else { return }
      do {
        try await Task.sleep(for: .milliseconds(300))
        let match = try await backend.searchTripPlaces(id, query: phrase, locale: copy.locale)
        guard !Task.isCancelled else { return }
        found = match.places
        if found.isEmpty { searchMessage = copy(match.available ? "tripPlanner.searchEmpty" : "tripPlanner.searchUnavailable") }
      } catch { if !Task.isCancelled { searchMessage = copy("tripPlanner.searchUnavailable") } }
    }
    .onDisappear { adding?.cancel() }
  }

  private func dayLabel(_ value: Int) -> String {
    value == 0 ? copy("tripPlanner.unplanned") : copy("trip.dayTab", ["day": value.formatted()])
  }

  private func add(_ place: TripPlaceChoice) {
    guard !busy else { return }
    busy = true
    adding = Task {
      defer { busy = false }
      do {
        try await backend.addTripStop(id, day: day, choice: place)
        if !Task.isCancelled { dismiss() }
      } catch { if !Task.isCancelled { searchMessage = copy("tripPlanner.addFailed") } }
    }
  }
}

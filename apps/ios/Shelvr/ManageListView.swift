import ShelvrKit
import SwiftUI

struct CreateListView: View {
  let created: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(MemberNamePrompts.self) private var prompts
  @State private var canAskName = false
  @State private var askingName = false
  @State private var continueCreation = false
  @State private var name = ""
  @State private var cities = ""
  @State private var operation = SocialOperation()

  var body: some View {
    let options = cities.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    Form {
      Section(copy("sharedLists.nameLabel")) { TextField(copy("sharedLists.namePlaceholder"), text: $name) }
      Section { TextField(copy("sharedLists.cityPlaceholder"), text: $cities) }
        header: { Text(copy("sharedLists.startWith")) } footer: { Text(copy("sharedLists.startWithHint")) }
      Button(copy("sharedLists.start")) {
        if canAskName && prompts.claim(for: backend.sessionGeneration) { askingName = true }
        else { create(options) }
      }.disabled(operation.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        name.utf16.count > 60 || options.isEmpty || options.count > 5)
    }
    .navigationTitle(copy("sharedLists.newTitle"))
    .task {
      do {
        for try await first in backend.query("users:getMyFirstName", as: String?.self) {
          try Task.checkCancellation()
          canAskName = first == nil
        }
      } catch {}
    }
    .sheet(isPresented: $askingName, onDismiss: {
      if continueCreation { continueCreation = false; create(options) }
    }) { MemberNamePrompt(creating: true) { continueCreation = true } }
    .socialOperation(operation, failure: copy("sharedLists.createFailed"), close: copy("common.close"))
  }
  private func create(_ cities: [String]) {
    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
    operation.run {
      let id = try await backend.createList(name: title, cities: cities)
      created(id)
    }
  }

}

struct AddListPlaceView: View {
  let detail: SharedListDetail
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var city: String
  init(detail: SharedListDetail, initialCity: String? = nil) {
    self.detail = detail
    _city = State(initialValue: initialCity.flatMap { detail.cities.contains($0) ? $0 : nil } ?? "")
  }
  @State private var search = ""
  @State private var result: ListPlaceSearch?
  @State private var searchFailed = false
  @State private var noAddition = false
  @State private var retry = 0
  @State private var operation = SocialOperation()

  var body: some View {
    let selected = city.isEmpty ? detail.cities.first ?? "" : city
    let words = search.split(whereSeparator: \.isWhitespace)
    NavigationStack {
      if !detail.covered {
        ContentUnavailableView {
          Label(copy("sharedLists.notCoveredTitle"), systemImage: "lock")
        } description: { Text(copy("sharedLists.notCoveredBody")) }
          actions: { Button(copy("planGate.seePlans")) { operation.askToPurchase() } }
      } else {
        List {
          Picker(copy("homePlaces.cities"), selection: Binding(get: { selected }, set: { city = $0 })) {
            ForEach(detail.cities, id: \.self) { Text($0).tag($0) }
          }
          TextField(copy("map.searchPlaceholder"), text: $search)
          SocialQuery(query: "mapPlaces:listMapPlaces", type: [ListSavePlace].self) { places in
            Section(copy("tripPlanner.fromSaves")) {
              ForEach(places.filter { place in
                PassportSection.cityKey(place.city) == PassportSection.cityKey(selected) &&
                  words.allSatisfy { place.name.localizedStandardContains(String($0)) } &&
                  !alreadyIncluded(place.name, place.lat, place.lng, place.appleId, item: place.itemId)
              }) { place in
                Button(place.name) {
                  operation.run {
                    if try await backend.addSavedPlace(place, to: detail._id) { dismiss() }
                    else { noAddition = true }
                  }
                }
              }
            }
          }
          ForEach(result?.places ?? []) { place in
            let included = alreadyIncluded(place.name, place.lat, place.lng, place.appleId)
            Button(place.name) {
              operation.run { try await backend.addFoundPlace(place, city: selected, to: detail._id); dismiss() }
            }.disabled(included)
            if included { Text(copy("sharedLists.onList")).font(.caption).foregroundStyle(.secondary) }
          }
          if result?.available == false {
            Text(copy("tripPlanner.searchUnavailable")).foregroundStyle(.secondary)
          }
          if result?.available == true && result?.places.isEmpty == true {
            Text(copy("tripPlanner.searchEmpty")).foregroundStyle(.secondary)
          }
          if searchFailed || result?.available == false { Button(copy("common.retry")) { retry += 1 } }
        }
        .disabled(operation.busy)
        .task(id: SearchRequest(city: selected, text: search, retry: retry)) {
          result = nil
          searchFailed = false
          guard search.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2, !selected.isEmpty else { return }
          do {
            try await Task.sleep(for: .milliseconds(300))
            let response = try await backend.searchList(detail._id, city: selected, text: search, locale: copy.locale)
            try Task.checkCancellation()
            result = response
          } catch { if !Task.isCancelled { searchFailed = true } }
        }
      }
    }
    .socialOperation(operation, failure: copy("sharedLists.failed"), close: copy("common.close"))
    .alert(copy("tripPlanner.addFailed"), isPresented: $noAddition) { Button(copy("common.close")) {} }
  }

  private func alreadyIncluded(_ name: String, _ lat: Double, _ lng: Double, _ apple: String?, item: String? = nil) -> Bool {
    detail.places.contains { $0.matches(name: name, lat: lat, lng: lng, apple: apple, item: item) }
  }

  private struct SearchRequest: Equatable { let city, text: String; let retry: Int }
}

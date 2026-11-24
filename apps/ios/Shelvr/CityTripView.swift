import MapKit
import ShelvrKit
import SwiftUI

struct NewCityTripView: View {
  let city: String
  let listID: String?
  let open: (AppLink) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var days = 3
  @State private var pace = "balanced"
  @State private var interests: Set<String> = ["food", "coffee", "sights"]
  @State private var dated = false
  @State private var start = Date()
  @State private var stay = ""
  @State private var busy = false
  @State private var message = ""
  @State private var gate = SocialOperation()
  @State private var generation: Task<Void, Never>?
  private let options = ["food", "coffee", "drinks", "culture", "sights", "outdoors", "shopping"]

  var body: some View {
    Form {
      Stepper(value: $days, in: 1...15) { LabeledContent(copy("trip.howManyDays"), value: days.formatted()) }
      Picker(copy("trip.pace"), selection: $pace) {
        ForEach(["easy", "balanced", "packed"], id: \.self) { value in
          Text(copy("trip.pace\(value.capitalized)")).tag(value)
        }
      }
      Section(copy("tripPlanner.interests")) {
        ForEach(options, id: \.self) { value in
          Toggle(copy("tripPlanner.interest\(value.capitalized)"), isOn: Binding(
            get: { interests.contains(value) },
            set: { on in
              if on { interests.insert(value) }
              else if interests.count > 1 { interests.remove(value) }
            }))
        }
      }
      Section {
        Toggle(copy("tripSetup.dates"), isOn: $dated)
        if dated { DatePicker(copy("tripSetup.startDate"), selection: $start, displayedComponents: .date) }
        TextField(copy("tripPlanner.stayPlaceholder"), text: $stay)
      }
      if busy { ProgressView() }
      else { Button(copy("tripSetup.start")) { generation = Task { await generate() } } }
      if !message.isEmpty { Text(message) }
    }.socialOperation(gate, failure: copy("errors.tryAgain"), close: copy("common.close"))
      .onDisappear { generation?.cancel() }.disabled(busy).navigationTitle(copy("tripPlanner.tripTitle", ["city": city]))
  }

  private func generate(canOffer: Bool = true) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    message = ""
    let format = DateFormatter()
    format.locale = Locale(identifier: "en_US_POSIX")
    format.calendar = Calendar(identifier: .gregorian)
    format.dateFormat = "yyyy-MM-dd"
    do {
      let id = try await backend.planTrip(city: city, days: days, pace: pace, interests: options.filter(interests.contains),
        start: dated ? format.string(from: start) : nil, stay: stay.trimmingCharacters(in: .whitespacesAndNewlines),
        locale: copy.locale, listID: listID)
      guard !Task.isCancelled else { return }
      if let id, let route = AppLink("/trip-plan/" + id) { open(route) }
      else { message = copy("tripPlanner.emptyResult", ["city": city]) }
    } catch {
      guard !Task.isCancelled else { return }
      if canOffer, listID != nil, PastedLink.requiresPro(error) {
        gate.askToPurchase { await generate(canOffer: false) }
      } else { message = copy("errors.retrySoon") }
    }
  }
}

struct CityTripView: View {
  let id: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var trip: CityTrip?
  @State private var loaded = false
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let trip {
        List {
          ForEach(Array(trip.days.enumerated()), id: \.offset) { index, stops in
            Section(copy("trip.dayTab", ["day": (index + 1).formatted()])) {
              if stops.isEmpty { Text(copy("tripSetup.emptyDay")).foregroundStyle(.secondary) }
              ForEach(stops) { stop in row(stop) }
            }
          }
          if !trip.unplanned.isEmpty {
            Section(copy("tripPlanner.unplanned")) { ForEach(trip.unplanned) { stop in row(stop) } }
          }
        }.navigationTitle(trip.name ?? copy("tripPlanner.tripTitle", ["city": trip.city]))
      } else if loaded { ContentUnavailableView(copy("tripPlanner.goneTitle"), systemImage: "suitcase") }
      else { ProgressView() }
    }
    .task(id: attempt) {
      failed = false
      do {
        for try await trip in backend.cityTrip(id) { self.trip = trip; loaded = true }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private func row(_ stop: CityTrip.Stop) -> some View {
    Button {
      let item = MKMapItem(placemark: .init(coordinate: .init(latitude: stop.lat, longitude: stop.lng)))
      item.name = stop.name
      item.openInMaps()
    } label: {
      VStack(alignment: .leading) {
        Text(stop.name).font(.headline)
        if let area = stop.area { Text(area).font(.caption) }
        if let time = stop.time { Text(time).font(.caption) }
        if let why = stop.why { Text(why).font(.subheadline) }
      }
    }.buttonStyle(.plain)
  }
}

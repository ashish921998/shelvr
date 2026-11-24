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
  @Environment(\.dismiss) private var dismiss
  @State private var confirmingDeletion = false
  @State private var trip: CityTrip?
  @State private var editing: CityTrip.Stop?
  @State private var editFailed = false
  @State private var busy = false
  @State private var undo: (String, TripPosition)?
  @State private var undoGeneration = 0
  @State private var renaming = false
  @State private var newName = ""
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
              ForEach(Array(stops.enumerated()), id: \.element.id) { position, stop in
                editableRow(stop, trip: trip, day: index + 1, index: position)
              }
              add(day: index + 1)
            }
          }
          Section(copy("tripPlanner.unplanned")) {
            ForEach(Array(trip.unplanned.enumerated()), id: \.element.id) { position, stop in
              editableRow(stop, trip: trip, day: 0, index: position)
            }
            add(day: 0)
          }
          if let undo {
            Button(copy("common.undo")) { change(clearPrevious: false) {
              _ = try await backend.moveTripStop(undo.0, day: undo.1.day, index: undo.1.index)
              self.undo = nil
            } }
          }
          if editFailed { Text(copy("tripPlanner.editFailed")) }
        }.disabled(busy)
         .toolbar {
          Menu {
            Button(copy("tripPlanner.nameLabel")) { newName = trip.name ?? ""; renaming = true }
            Button(copy("tripPlanner.delete"), role: .destructive) { confirmingDeletion = true }
          } label: { Label(copy("tripPlanner.tripActions"), systemImage: "ellipsis.circle") }
        }
        .confirmationDialog(copy("tripPlanner.deleteTitle"), isPresented: $confirmingDeletion, titleVisibility: .visible) {
          Button(copy("tripPlanner.delete"), role: .destructive) { change {
            try await backend.client.mutation("tripPlannerData:deleteTripPlan", with: ["tripId": id])
            dismiss()
          } }
          Button(copy("common.cancel"), role: .cancel) {}
        } message: { Text(copy("tripPlanner.deleteBody")) }
        .alert(copy("tripPlanner.nameLabel"), isPresented: $renaming) {
          TextField(copy("tripPlanner.nameLabel"), text: $newName)
          Button(copy("common.save")) { change { try await backend.renameTrip(id, name: newName) } }
            .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || newName.utf16.count > 80)
          Button(copy("common.cancel"), role: .cancel) {}
        }
        .sheet(item: $editing) { stop in TripStopEditor(stop: stop) { undo = nil } }
        .navigationTitle(trip.name ?? copy("tripPlanner.tripTitle", ["city": trip.city]))
      } else if loaded { ContentUnavailableView(copy("tripPlanner.goneTitle"), systemImage: "suitcase") }
      else { ProgressView() }
    }
    .onDisappear { undo = nil }
    .task(id: undoGeneration) {
      guard undo != nil else { return }
      try? await Task.sleep(for: .seconds(10))
      if !Task.isCancelled { undo = nil }
    }
    .task(id: attempt) {
      failed = false
      do {
        for try await trip in backend.cityTrip(id) { self.trip = trip; loaded = true }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private func add(day: Int) -> some View {
    Group {
      if let link = AppLink("/add-trip-stop?tripId=\(id)&day=\(day)") {
        NavigationLink(value: link) { Label(copy("tripPlanner.addPlace"), systemImage: "plus") }
      }
    }
  }

  private func editableRow(_ stop: CityTrip.Stop, trip: CityTrip, day: Int, index: Int) -> some View {
    let count = day == 0 ? trip.unplanned.count : trip.days[day - 1].count
    return HStack {
      row(stop)
      Spacer()
      Menu {
        Button(copy("tripPlanner.stopDetails")) { editing = stop }
        if index > 0 { Button(copy("tripPlanner.moveUp")) { move(stop.id, day: day, index: index - 1) } }
        if index + 1 < count { Button(copy("tripPlanner.moveDown")) { move(stop.id, day: day, index: index + 1) } }
        ForEach(0...trip.days.count, id: \.self) { target in
          if target != day {
            Button(target == 0 ? copy("tripPlanner.moveToUnplanned") :
              copy("tripPlanner.moveToDay", ["day": copy("trip.dayTab", ["day": target.formatted()])])) {
              move(stop.id, day: target, index: target == 0 ? trip.unplanned.count : trip.days[target - 1].count)
            }
          }
        }
        if day != 0 {
          Button(copy("tripPlanner.removeStop", ["name": stop.name]), role: .destructive) {
            change { offerUndo(stop.id, try await backend.removeTripStop(stop.id)) }
          }
        }
      } label: { Image(systemName: "ellipsis.circle") }
      .accessibilityLabel(copy("tripPlanner.stopActions", ["name": stop.name]))
    }
  }

  private func offerUndo(_ id: String, _ position: TripPosition) {
    undoGeneration += 1
    undo = (id, position)
  }

  private func move(_ stop: String, day: Int, index: Int) {
    change { offerUndo(stop, try await backend.moveTripStop(stop, day: day, index: index)) }
  }

  private func change(clearPrevious: Bool = true, _ operation: @escaping @MainActor () async throws -> Void) {
    guard !busy else { return }
    busy = true
    editFailed = false
    if clearPrevious { undo = nil }
    Task {
      defer { busy = false }
      do { try await operation() } catch { editFailed = true }
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

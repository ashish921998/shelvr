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
  @State private var gate = SocialOperation(placement: "plan_trip")
  @State private var generation: Task<Void, Never>?
  @State private var visible = false
  @State private var savedCity: Bool?
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
      .onAppear { visible = true }
      .task { do { for try await saves in backend.citySaves(city) { savedCity = !saves.isEmpty } } catch {} }
      .onDisappear {
        visible = false
        generation?.cancel()
        gate.dismissed()
      }
      .disabled(busy).navigationTitle(copy("tripPlanner.tripTitle", ["city": city]))
  }

  private func generate(canOffer: Bool = true) async {
    guard visible, !busy, !Task.isCancelled else { return }
    busy = true
    defer { busy = false }
    message = ""
    let format = DateFormatter()
    format.locale = Locale(identifier: "en_US_POSIX")
    format.calendar = Calendar(identifier: .gregorian)
    format.dateFormat = "yyyy-MM-dd"
    var started: [String: Any] = ["days": days, "pace": pace, "interest_count": interests.count,
      "dated": dated, "has_stay": !stay.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty]
    if let savedCity { started["saved_city"] = savedCity }
    Analytics.capture("trip_plan_started", started)
    do {
      let result = try await backend.planTrip(city: city, days: days, pace: pace, interests: options.filter(interests.contains),
        start: dated ? format.string(from: start) : nil, stay: stay.trimmingCharacters(in: .whitespacesAndNewlines),
        locale: copy.locale, listID: listID)
      Analytics.capture("trip_plan_made", ["days": days, "pace": pace, "saves": result.saves,
        "suggested": result.suggested, "made": result.tripId != nil])
      guard !Task.isCancelled else { return }
      if let id = result.tripId, let route = AppLink("/trip-plan/" + id) { open(route) }
      else { message = copy("tripPlanner.emptyResult", ["city": city]) }
    } catch {
      guard !Task.isCancelled else { return }
      Analytics.capture("trip_plan_failed", ["reason": PastedLink.planningFailure(error)])
      if canOffer, listID != nil, SaveFailure(error) == .proRequired {
        gate.askToPurchase {
          guard visible else { return }
          let retry = Task { await generate(canOffer: false) }
          generation = retry
          await retry.value
        }
      } else { message = copy("errors.retrySoon") }
    }
  }
}

struct CityTripView: View {
  let id: String
  var sharedOnly = false
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var confirmingDeletion = false
  @State private var trip: CityTrip?
  @State private var editing: CityTrip.Stop?
  @State private var editFailed = false
  @State private var busy = false
  @State private var undo: (String, TripPosition, String)?
  @State private var opened = false
  @State private var undoGeneration = 0
  @State private var renaming = false
  @State private var newName = ""
  @State private var loaded = false
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if loaded && sharedOnly && trip?.listId == nil { TripRevocationView(id: id) }
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
              Analytics.capture("trip_plan_edit_undone", ["action": undo.2])
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
            Analytics.capture("trip_plan_deleted")
            dismiss()
          } }
          Button(copy("common.cancel"), role: .cancel) {}
        } message: { Text(copy("tripPlanner.deleteBody")) }
        .alert(copy("tripPlanner.nameLabel"), isPresented: $renaming) {
          TextField(copy("tripPlanner.nameLabel"), text: $newName)
          Button(copy("common.save")) {
            let changed = TripEdit.renamed(newName, from: trip.name)
            change {
              try await backend.renameTrip(id, name: newName)
              if changed { Analytics.capture("trip_plan_renamed", ["cleared": newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty]) }
            }
          }
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
    .task(id: "\(attempt):\(sharedOnly)") {
      failed = false
      loaded = false
      trip = nil
      do {
        for try await trip in backend.cityTrip(id, sharedOnly: sharedOnly) {
          try Task.checkCancellation()
          self.trip = trip
          loaded = true
          if let trip, !opened {
            opened = true
            let stops = trip.days.flatMap { $0 }
            Analytics.capture("trip_plan_opened", ["days": trip.days.count, "stops": stops.count,
              "saved": stops.filter { $0.source == "save" }.count])
          }
        }
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
        if index > 0 { Button(copy("tripPlanner.moveUp")) { move(stop.id, from: day, day: day, index: index - 1) } }
        if index + 1 < count { Button(copy("tripPlanner.moveDown")) { move(stop.id, from: day, day: day, index: index + 1) } }
        ForEach(0...trip.days.count, id: \.self) { target in
          if target != day {
            Button(target == 0 ? copy("tripPlanner.moveToUnplanned") :
              copy("tripPlanner.moveToDay", ["day": copy("trip.dayTab", ["day": target.formatted()])])) {
              move(stop.id, from: day, day: target, index: target == 0 ? trip.unplanned.count : trip.days[target - 1].count)
            }
          }
        }
        if day != 0 {
          Button(copy("tripPlanner.removeStop", ["name": stop.name]), role: .destructive) {
            change {
              offerUndo(stop.id, try await backend.removeTripStop(stop.id), kind: "remove")
              Analytics.capture("trip_plan_stop_removed", ["source": stop.source ?? "added"])
            }
          }
        }
      } label: { Image(systemName: "ellipsis.circle") }
      .accessibilityLabel(copy("tripPlanner.stopActions", ["name": stop.name]))
    }
  }

  private func offerUndo(_ id: String, _ position: TripPosition, kind: String) {
    undoGeneration += 1
    undo = (id, position, kind)
  }

  private func move(_ stop: String, from: Int, day: Int, index: Int) {
    change {
      offerUndo(stop, try await backend.moveTripStop(stop, day: day, index: index), kind: "move")
      Analytics.capture("trip_plan_stop_moved", ["across_days": from != day, "method": "menu"])
    }
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
      Analytics.capture("trip_plan_stop_opened", ["source": stop.source ?? "added", "action": "maps"])
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

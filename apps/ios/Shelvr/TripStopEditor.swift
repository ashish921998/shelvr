import ShelvrKit
import SwiftUI

struct TripStopEditor: View {
  let stop: CityTrip.Stop
  let changed: () -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.dismiss) private var dismiss
  @State private var time: String
  @State private var note: String
  @State private var busy = false
  @State private var failed = false

  init(stop: CityTrip.Stop, changed: @escaping () -> Void) {
    self.changed = changed
    self.stop = stop
    _time = State(initialValue: stop.time ?? "")
    _note = State(initialValue: stop.note ?? "")
  }

  var body: some View {
    NavigationStack {
      Form {
        TextField(copy("tripPlanner.stopTime"), text: $time).keyboardType(.numbersAndPunctuation)
        if !TripEdit.validTime(time) { Text(copy("tripPlanner.stopTimeInvalid")) }
        TextField(copy("tripPlanner.stopNote"), text: $note, axis: .vertical)
        if failed { Text(copy("tripPlanner.editFailed")) }
      }.navigationTitle(stop.name)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button(copy("common.cancel")) { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy("common.save")) { Task { await save() } }
            .disabled(!TripEdit.validTime(time) || note.utf16.count > 500)
        }
      }
      .disabled(busy).interactiveDismissDisabled(busy)
    }
  }

  private func save() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do { try await backend.updateStop(stop, time: time, note: note); changed(); dismiss() }
    catch { failed = true }
  }
}

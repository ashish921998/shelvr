import MapKit
import ShelvrKit
import SwiftUI

struct SaveSpotRevealView: View {
  let id: String
  let finish: (String?) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var save: LibrarySave?
  @State private var loaded = false
  @State private var started = Date()
  @State private var ready: Date?

  var body: some View {
    TimelineView(.periodic(from: started, by: 0.5)) { context in
      switch SaveSpotReveal.result(save: save, loaded: loaded, waited: context.date.timeIntervalSince(started),
        readyFor: ready.map { context.date.timeIntervalSince($0) } ?? 0) {
      case .finding: ProgressView(copy("spots.finding"))
      case .map: Color.clear.task { finish(nil) }
      case let .spots(city, pins):
        List {
          Map {
            ForEach(Array(pins.enumerated()), id: \.offset) { _, pin in
              if let lat = pin.lat, let lng = pin.lng {
                Marker(pin.name, coordinate: .init(latitude: lat, longitude: lng))
              }
            }
          }.frame(height: 245).listRowInsets(.init())
          ForEach(Array(pins.enumerated()), id: \.offset) { _, pin in Label(pin.name, systemImage: "mappin") }
          Button(copy("spots.openCity", ["city": city])) { finish(city) }
          Button(copy("common.done")) { finish(nil) }
        }.navigationTitle(copy("spots.addedTo", ["city": city]))
      }
    }
    .task {
      do {
        for try await entry in backend.librarySave(id: id) {
          guard !Task.isCancelled else { return }
          if ready == nil, entry?.status == "ready" { ready = .now }
          save = entry
          loaded = true
        }
      } catch { if !Task.isCancelled { loaded = true; save = nil } }
    }
  }
}

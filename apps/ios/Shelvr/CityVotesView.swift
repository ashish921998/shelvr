import ShelvrKit
import SwiftUI

struct CityVotesView: View {
  let city: String
  let pins: [CityPlace]
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var votes: CityVotes?
  @State private var selection = Set<CityPlace>()
  @State private var share: URL?
  @State private var loaded = false
  @State private var busy = false
  @State private var failed = false
  @State private var attempt = 0
  @State private var presenting = false
  @State private var message = ""
  @State private var seen = false

  var body: some View {
    Section {
      TimelineView(.periodic(from: .now, by: 60)) { context in
        if let votes {
          if votes.isOpen(at: context.date) && votes.voters == 0 { Text(copy("plan.noVotesYet")) }
          if !votes.isOpen(at: context.date) && votes.voters > 0 {
            Text(copy("plan.votingClosed", count: votes.voters))
          }
          ForEach(votes.places) { place in
            if votes.voters > 0 {
              HStack {
                Text(place.name)
                Spacer()
                Label(place.picks.formatted(), systemImage: "checkmark")
                Label(place.passes.formatted(), systemImage: "xmark")
              }.font(.subheadline)
            }
          }
        }
      }
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else {
        Button(copy("plan.ask")) {
          let existing = openLink
          Analytics.capture("plan_ask_opened", ["has_link": existing != nil])
          let mapped = pins.filter { existing?.match($0, among: pins) != nil }
          selection = Set((mapped.isEmpty ? pins : mapped).prefix(5))
          share = nil
          message = ""
          presenting = true
        }.disabled(!loaded || pins.isEmpty)
      }
    }
    .sheet(isPresented: $presenting) {
      NavigationStack {
        Form {
          Section {
            ForEach(pins) { pin in
              Toggle(pin.name, isOn: Binding(
                get: { selection.contains(pin) },
                set: { on in
                  if on && selection.count < 5 { selection.insert(pin) }
                  if !on { selection.remove(pin) }
                  share = nil
                }))
                .disabled(!selection.contains(pin) && selection.count >= 5)
            }
          } footer: { Text(copy("plan.askBody", ["limit": "5"])) }
          if let link = openLink, !link.sameSelection(chosen, among: pins) { Text(copy("plan.newLinkHint")) }
          if let share {
            ShareLink(item: share) { Label(copy("plan.shareLink"), systemImage: "square.and.arrow.up") }
          } else {
            Button(copy("plan.askSend")) { Task { await prepare() } }.disabled(chosen.isEmpty)
          }
          if !message.isEmpty { Text(message) }
        }.disabled(busy)
        .navigationTitle(copy("plan.ask"))
        .toolbar { Button(copy("common.done")) { presenting = false } }
        .interactiveDismissDisabled(busy)
      }
    }
    .task(id: attempt) {
      failed = false
      do {
        for try await votes in backend.cityVotes(city) {
          self.votes = votes; loaded = true
          if !seen, let votes { seen = true; Analytics.capture("plan_votes_seen", ["voters": votes.voters, "open": votes.isOpen(at: .now)]) }
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }

  private var openLink: CityVotes? { votes.flatMap { $0.isOpen(at: .now) ? $0 : nil } }
  private var chosen: [CityPlace] { pins.filter(selection.contains) }

  private func prepare() async {
    guard !busy, !chosen.isEmpty, let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    busy = true
    defer { busy = false }
    do {
      let token: String
      if let link = openLink, link.sameSelection(chosen, among: pins) { token = link.token }
      else { token = try await backend.shareCityPlaces(city: city, selected: chosen) }
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      let devOrigin = ProcessInfo.processInfo.environment["SHELVR_WEB_URL"].flatMap(URL.init(string:))
      let origin = backend.environment.variant == .development ? devOrigin : nil
      share = (origin ?? URL(string: "https://tryshelvr.app")!).appendingPathComponent("p").appendingPathComponent(token)
      message = ""
    } catch {
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      Analytics.capture("plan_ask_failed", ["reason": "link"])
      message = copy("plan.askFailedTitle")
    }
  }
}

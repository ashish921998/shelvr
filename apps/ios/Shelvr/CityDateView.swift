import MapKit
import ShelvrKit
import SwiftUI

struct CityDateView: View {
  let city: String
  let listID: String?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var result: CityDate?
  @State private var evening: Evening?
  @State private var triedFirst = Set<Int>()
  @State private var triedSecond = Set<Int>()
  @State private var busy = false
  @State private var failed = false
  @State private var gate = SocialOperation(placement: "make_plan")
  @State private var picking = false
  @State private var starts: [DateStart]?
  @State private var lockedFirst = false
  @State private var anchorFailed = false
  @State private var loadAttempt = 0

  var body: some View {
    List {
      if busy { ProgressView(copy("datePlan.planning")) }
      else if let result {
        if let evening, result.stops.indices.contains(evening.first), result.stops.indices.contains(evening.second) {
          stop(result, evening, first: true)
          stop(result, evening, first: false)
          ShareLink(item: [copy("datePlan.shareIntro", ["city": city]), result.stops[evening.first].name, result.stops[evening.second].name].joined(separator: "\n")) {
            Label(copy("datePlan.send"), systemImage: "square.and.arrow.up")
          }
        } else {
          let noPair = result.status == "no_pair"
          ContentUnavailableView(copy(lockedFirst ? "datePlan.tryAnotherFirst" : noPair ? "datePlan.noPairTitle" : "datePlan.noAnchorTitle"), systemImage: "mappin.slash",
            description: Text(copy(lockedFirst ? "datePlan.firstUnavailable" : noPair ? "datePlan.noPairBody" : result.kind == "classic" ? "datePlan.noAnchorClassic" : "datePlan.noAnchorLowkey", ["city": city])))
        }
        Button(copy(lockedFirst && evening == nil ? "datePlan.pickFirst" : "datePlan.changeKind")) {
          if lockedFirst && evening == nil { picking = true }
          self.result = nil; self.evening = nil
          lockedFirst = false
        }
      } else {
        Button(copy("datePlan.pickFirst")) { picking = true }
        ForEach([
          ("classic", copy("datePlan.classic"), copy("datePlan.classicHint")),
          ("lowkey", copy("datePlan.lowkey"), copy("datePlan.lowkeyHint")),
          ("surprise", copy("datePlan.surprise"), copy("datePlan.surpriseHint")),
        ], id: \.0) { kind, title, hint in
          Button {
            Task { await generate(kind) }
          } label: {
            VStack(alignment: .leading) {
              Text(title).font(.headline)
              Text(hint).font(.caption)
            }
          }
        }
        if failed { Text(copy("datePlan.failed")) }
      }
    }.navigationTitle(city)
      .socialOperation(gate, failure: copy("datePlan.failed"), close: copy("common.close"))
    .sheet(isPresented: $picking) {
      NavigationStack {
        Group {
          if anchorFailed { Button(copy("common.retry")) { loadAttempt += 1 } }
          else if let starts {
            if starts.isEmpty { Text(copy("datePlan.firstUnavailable")) }
            else {
              List(starts, id: \.self) { spot in
                Button(spot.name) { picking = false; Task { await generate("surprise", firstSpot: spot) } }
              }
            }
          } else { ProgressView() }
        }
        .navigationTitle(copy("datePlan.pickFirst"))
        .toolbar { Button(copy("common.cancel")) { picking = false } }
        .task(id: loadAttempt) {
          anchorFailed = false
          do { for try await starts in backend.dateStarts(city: city, listID: listID) { self.starts = starts } }
          catch { if !Task.isCancelled { anchorFailed = true } }
        }
      }
    }
  }

  private func stop(_ date: CityDate, _ current: Evening, first: Bool) -> some View {
    let index = first ? current.first : current.second
    let spot = date.stops[index]
    let next = date.swap(current, first: first, tried: first ? triedFirst : triedSecond)
    return VStack(alignment: .leading, spacing: 8) {
      Text(spot.name).font(.headline)
      if let why = spot.why { Text(why).font(.subheadline) }
      Button(copy("plan.openMaps")) {
        Analytics.capture("date_plan_stop_opened", ["source": spot.source, "action": "maps"])
        let item = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: spot.lat, longitude: spot.lng)))
        item.name = spot.name
        item.openInMaps()
      }
      if let next, !(first && lockedFirst) {
        Button(copy("datePlan.changeFor", ["name": spot.name])) {
          if first { triedFirst = date.nextRound(triedFirst, from: index, to: next.first); triedSecond = [] }
          else { triedSecond = date.nextRound(triedSecond, from: index, to: next.second); triedFirst = [] }
          Analytics.capture("date_plan_swapped", ["slot": first ? "first" : "second", "swapped": true])
          evening = next
        }
      }
    }.buttonStyle(.borderless)
  }

  private func generate(_ kind: String, firstSpot: DateStart? = nil, canOffer: Bool = true) async {
    guard !busy, let owner = backend.userID else { return }
    let session = backend.sessionGeneration
    busy = true
    Analytics.capture("date_plan_started", ["kind": kind])
    defer { busy = false }
    failed = false
    do {
      let plan = try await backend.planDate(city: city, kind: kind, locale: copy.locale, listID: listID, firstSpot: firstSpot)
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      lockedFirst = firstSpot != nil
      Analytics.capture("date_plan_made", ["kind": plan.kind, "asked": kind, "status": plan.status, "evenings": plan.evenings.count, "suggested": plan.stops.filter { $0.source == "suggested" }.count])
      result = plan
      evening = plan.evenings.first
      triedFirst = []; triedSecond = []
    } catch {
      guard !Task.isCancelled, backend.userID == owner, backend.sessionGeneration == session else { return }
      Analytics.capture("date_plan_failed", ["reason": PastedLink.planningFailure(error)])
      if canOffer, listID != nil, SaveFailure(error) == .proRequired {
        gate.askToPurchase { await generate(kind, firstSpot: firstSpot, canOffer: false) }
      } else { failed = true }
    }
  }
}

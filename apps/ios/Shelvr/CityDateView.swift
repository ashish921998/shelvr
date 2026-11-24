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
          ContentUnavailableView(copy(noPair ? "datePlan.noPairTitle" : "datePlan.noAnchorTitle"), systemImage: "mappin.slash",
            description: Text(copy(noPair ? "datePlan.noPairBody" : result.kind == "classic" ? "datePlan.noAnchorClassic" : "datePlan.noAnchorLowkey", ["city": city])))
        }
        Button(copy("datePlan.changeKind")) { self.result = nil; self.evening = nil }
      } else {
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
  }

  private func stop(_ date: CityDate, _ current: Evening, first: Bool) -> some View {
    let index = first ? current.first : current.second
    let spot = date.stops[index]
    let next = date.swap(current, first: first, tried: first ? triedFirst : triedSecond)
    return VStack(alignment: .leading, spacing: 8) {
      Text(spot.name).font(.headline)
      if let why = spot.why { Text(why).font(.subheadline) }
      Button(copy("plan.openMaps")) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: spot.lat, longitude: spot.lng)))
        item.name = spot.name
        item.openInMaps()
      }
      if let next {
        Button(copy("datePlan.changeFor", ["name": spot.name])) {
          if first { triedFirst = date.nextRound(triedFirst, from: index, to: next.first); triedSecond = [] }
          else { triedSecond = date.nextRound(triedSecond, from: index, to: next.second); triedFirst = [] }
          Analytics.capture("date_plan_swapped", ["slot": first ? "first" : "second", "swapped": true])
          evening = next
        }
      }
    }.buttonStyle(.borderless)
  }

  private func generate(_ kind: String) async {
    guard !busy else { return }
    busy = true
    Analytics.capture("date_plan_started", ["kind": kind])
    defer { busy = false }
    failed = false
    do {
      let plan = try await backend.planDate(city: city, kind: kind, locale: copy.locale, listID: listID)
      Analytics.capture("date_plan_made", ["kind": plan.kind, "asked": kind, "status": plan.status, "evenings": plan.evenings.count, "suggested": plan.stops.filter { $0.source == "suggested" }.count])
      result = plan
      evening = plan.evenings.first
      triedFirst = []; triedSecond = []
    } catch { Analytics.capture("date_plan_failed", ["reason": PastedLink.requiresPro(error) ? "pro_required" : "error"]); failed = true }
  }
}

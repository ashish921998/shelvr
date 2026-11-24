import MapKit
import ShelvrKit
import SwiftUI

struct StampPlacesView: View {
  let city: String?
  let finished: (String) -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var inspect: String?
  @State private var card: MKMapItem?
  @State private var lookupFailed = false
  @State private var picked: Set<UnstampedPlace.ID> = []
  @State private var operation = SocialOperation()

  var body: some View {
    SocialQuery(query: city == nil ? "placeVisits:listUnstampedPlaces" : "placeVisits:listUnstampedPlacesInCity",
      arguments: city.map { ["city": $0] } ?? [:], type: [UnstampedPlace].self) { places in
      let chosen = places.filter { picked.contains($0.id) }
      if places.isEmpty {
        ContentUnavailableView(city.map { copy("passport.nextEmpty", ["city": $0]) } ?? copy("passport.nothingToStamp"),
          systemImage: "seal")
      } else {
        List {
          ForEach(groups(places), id: \.0) { key, rows in
            let similar = Dictionary(grouping: rows) { [$0.name.lowercased(), ($0.title ?? "").lowercased()] }
            Section(key) {
              ForEach(rows) { place in
                let twins = similar[[place.name.lowercased(), (place.title ?? "").lowercased()]] ?? []
                HStack {
                  Button {
                  if city != nil {
                    operation.run {
                      try await backend.stampNow(place)
                      finished(copy("passport.momentStamped", ["name": place.name]))
                    }
                  } else if picked.contains(place.id) { picked.remove(place.id) }
                  else if chosen.count < 60 { picked.insert(place.id) }
                } label: {
                  HStack {
                    VStack(alignment: .leading) {
                      Text(place.name)
                      if let title = place.title, !title.isEmpty { Text(title).font(.caption).foregroundStyle(.secondary) }
                      if twins.count > 1 {
                        Text(place.coordinates).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                      }
                    }
                    Spacer()
                    Image(systemName: city != nil ? "seal" : picked.contains(place.id) ? "checkmark.circle.fill" : "circle")
                  }
                }.disabled(operation.busy || (city == nil && !picked.contains(place.id) && chosen.count >= 60))
                  .accessibilityAddTraits(picked.contains(place.id) ? .isSelected : [])
                  .buttonStyle(.borderless)
                  if twins.count > 1, let appleId = place.appleId {
                    Button { inspect = appleId } label: {
                      Image(systemName: "map").frame(width: 44, height: 44)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(copy("plan.openMapsFor", ["name": place.name]))
                  }
                }
              }
            }
          }
        }
        .safeAreaInset(edge: .bottom) {
          if city == nil {
            Button(copy("passport.stampCount", count: chosen.count)) {
              operation.run {
                let count = try await backend.stampBefore(chosen)
                finished(copy("passport.momentBulk", count: count))
              }
            }.disabled(chosen.isEmpty || operation.busy).buttonStyle(.borderedProminent).padding()
          }
        }
      }
    }
    .mapItemDetailSheet(item: $card, displaysMap: true)
    .task(id: inspect) {
      guard let inspect, let id = MKMapItem.Identifier(rawValue: inspect) else { return }
      do {
        let item = try await MKMapItemRequest(mapItemIdentifier: id).mapItem
        try Task.checkCancellation()
        card = item
      } catch { if !Task.isCancelled { lookupFailed = true } }
      if !Task.isCancelled { self.inspect = nil }
    }
    .alert(copy("common.unavailable"), isPresented: $lookupFailed) { Button(copy("common.close")) {} }
    .navigationTitle(copy(city == nil ? "passport.beenTitle" : "passport.nextTitle"))
    .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
  }

  private func groups(_ places: [UnstampedPlace]) -> [(String, [UnstampedPlace])] {
    var order: [String] = [], groups: [String: [UnstampedPlace]] = [:]
    for place in places {
      let key = PassportSection.cityKey(place.city)
      if groups[key] == nil { order.append(key) }
      groups[key, default: []].append(place)
    }
    return order.compactMap { key in
      guard let rows = groups[key], let city = rows.first?.city else { return nil }
      return (city, rows)
    }
  }
}

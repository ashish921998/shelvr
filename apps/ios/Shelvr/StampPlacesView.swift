import ShelvrKit
import SwiftUI

struct StampPlacesView: View {
  let city: String?
  let finished: () -> Void
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
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
            Section(key) {
              ForEach(rows) { place in
                Button {
                  if city != nil {
                    operation.run { try await backend.stampNow(place); finished() }
                  } else if picked.contains(place.id) { picked.remove(place.id) }
                  else if chosen.count < 60 { picked.insert(place.id) }
                } label: {
                  HStack {
                    Text(place.name)
                    Spacer()
                    Image(systemName: city != nil ? "seal" : picked.contains(place.id) ? "checkmark.circle.fill" : "circle")
                  }
                }.disabled(operation.busy || (city == nil && !picked.contains(place.id) && chosen.count >= 60))
                  .accessibilityAddTraits(picked.contains(place.id) ? .isSelected : [])
              }
            }
          }
        }
        .safeAreaInset(edge: .bottom) {
          if city == nil {
            Button(copy.count("passport.stampCount", chosen.count)) {
              operation.run {
                _ = try await backend.stampBefore(chosen)
                finished()
              }
            }.disabled(chosen.isEmpty || operation.busy).buttonStyle(.borderedProminent).padding()
          }
        }
      }
    }
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

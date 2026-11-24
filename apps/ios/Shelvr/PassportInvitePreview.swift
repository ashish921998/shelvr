import ShelvrKit
import SwiftUI

struct PassportInvitePreview: View {
  let token: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var snapshot: Preview?
  @State private var settled = false
  @State private var failed = false
  @State private var attempt = 0

  private struct Preview: Decodable {
    struct City: Decodable { let city: String?; let names: [String] }
    let ownerName: String?
    let places, cities: Int
    let countries: Int?
    let byCity: [City]
  }

  var body: some View {
    Group {
      if failed { Button(copy("common.retry")) { attempt += 1 } }
      else if let snapshot {
        List {
          LabeledContent(copy("passport.places"), value: snapshot.places.formatted())
          LabeledContent(copy("passport.cities"), value: snapshot.cities.formatted())
          if let countries = snapshot.countries { LabeledContent(copy("passport.countries"), value: countries.formatted()) }
          ForEach(snapshot.byCity.indices, id: \.self) { index in
            let group = snapshot.byCity[index]
            Section(group.city ?? copy("passport.elsewhere")) {
              ForEach(group.names.indices, id: \.self) { Text(group.names[$0]) }
            }
          }
        }
      } else if settled {
        ContentUnavailableView(copy("passportShare.deadTitle"), systemImage: "book.closed", description: Text(copy("passportShare.deadBody")))
      } else { ProgressView() }
    }
    .navigationTitle(snapshot?.ownerName.map { copy("passportShare.title", ["name": $0]) } ?? copy("passportShare.titleNoName"))
    .task(id: attempt) {
      failed = false
      do {
        for try await value in backend.client.subscribe(to: "passportShares:passportPreview",
          with: ["token": token], yielding: Preview?.self).values {
          try Task.checkCancellation()
          settled = true
          snapshot = value
        }
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

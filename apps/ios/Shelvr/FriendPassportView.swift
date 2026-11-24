import ShelvrKit
import SwiftUI

struct FriendPassportView: View {
  let token: String
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var compare = false
  @State private var saved: Int?
  @State private var inactive = false
  @State private var operation = SocialOperation()

  var body: some View {
    SocialQuery(query: "passportShares:passportPreview", arguments: ["token": token], type: FriendPassport?.self) { passport in
      if let passport, !inactive {
        List {
          Section {
            LabeledContent(copy("passport.places"), value: passport.places.formatted())
            LabeledContent(copy("passport.cities"), value: passport.cities.formatted())
            if let countries = passport.countries { LabeledContent(copy("passport.countries"), value: countries.formatted()) }
            Button(copy("passportShare.compare")) { compare.toggle() }
          }
          if compare {
            SocialQuery(query: "passportShares:comparePassport", arguments: ["token": token],
              type: PassportComparison?.self) { comparison in
              if let comparison {
                places(comparison.both, title: copy("passportShare.both"))
                places(comparison.onlyThem, title: comparison.ownerName.map { copy("passportShare.onlyThem", ["name": $0]) }
                  ?? copy("passportShare.onlyThemNoName"))
                places(comparison.onlyYou, title: copy("passportShare.onlyYou"))
                if comparison.toSave > 0 {
                  Button("\(copy("common.save")) (\(comparison.toSave))") {
                    let note = comparison.ownerName.map { copy("passportShare.fromFriend", ["name": $0]) }
                      ?? copy("passportShare.fromFriendNoName")
                    operation.run {
                      guard let result = try await backend.saveFriendPlaces(token: token, note: note) else {
                        inactive = true
                        return
                      }
                      saved = (saved ?? 0) + result.saved
                    }
                  }.disabled(operation.busy)
                }
                if let saved {
                  Label("\(copy("passport.places")) · \(saved)", systemImage: "checkmark")
                }
              } else { dead }
            }
          } else {
            ForEach(passport.byCity.indices, id: \.self) { i in
              let group = passport.byCity[i]
              Section(group.city ?? copy("passport.elsewhere")) {
                ForEach(group.names.indices, id: \.self) { n in Text(group.names[n]) }
              }
            }
          }
        }
        .navigationTitle(passport.ownerName.map { copy("passportShare.title", ["name": $0]) } ?? copy("passportShare.titleNoName"))
      } else { dead }
    }
    .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
  }

  @ViewBuilder private func places(_ rows: [PassportComparison.Place], title: String) -> some View {
    if !rows.isEmpty {
      Section(title) {
        ForEach(rows.indices, id: \.self) { i in
          VStack(alignment: .leading) {
            Text(rows[i].name)
            if let city = rows[i].city { Text(city).font(.caption).foregroundStyle(.secondary) }
          }
        }
      }
    }
  }

  private var dead: some View {
    ContentUnavailableView(copy("passportShare.deadTitle"), systemImage: "book.closed",
      description: Text(copy("passportShare.deadBody")))
  }
}

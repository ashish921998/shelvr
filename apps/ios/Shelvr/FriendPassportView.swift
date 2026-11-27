import ShelvrKit
import SwiftUI

struct FriendPassportView: View {
  let token: String
  var requestComparison: (() -> Void)?
  init(token: String, compareInitially: Bool = false, requestComparison: (() -> Void)? = nil) {
    self.token = token
    self.requestComparison = requestComparison
    _compare = State(initialValue: compareInitially)
  }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var compare = false
  @State private var comparison: PassportComparison?
  @State private var comparisonLoaded = false
  @State private var comparisonFailed = false
  @State private var compareAttempt = 0
  @State private var saved: Int?
  @State private var inactive = false
  @State private var operation = SocialOperation(placement: "passport_friend_places")

  var body: some View {
    SocialQuery(query: "passportShares:passportPreview", arguments: ["token": token], type: FriendPassport?.self) { passport in
      if let passport, !inactive {
        List {
          Section {
            LabeledContent(copy("passport.places"), value: passport.places.formatted())
            LabeledContent(copy("passport.cities"), value: passport.cities.formatted())
            if let countries = passport.countries { LabeledContent(copy("passport.countries"), value: countries.formatted()) }
            Button(copy("passportShare.compare")) {
              if let requestComparison { requestComparison() } else { compare.toggle() }
            }
          }
          if compare {
            if comparisonFailed { Button(copy("common.retry")) { compareAttempt += 1 } }
            else if let comparison {
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
            } else if comparisonLoaded { dead } else { ProgressView() }
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
    .background {
      Color.clear.task(id: CompareRequest(token: token, compare: compare, attempt: compareAttempt)) {
        comparison = nil
        comparisonLoaded = false
        comparisonFailed = false
        guard compare, requestComparison == nil else { return }
        do {
          for try await value in backend.socialQuery("passportShares:comparePassport", arguments: ["token": token],
            as: PassportComparison?.self) {
            try Task.checkCancellation()
            comparison = value
            comparisonLoaded = true
          }
        } catch { if !Task.isCancelled { comparisonFailed = true } }
      }
    }
    .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
  }

  private struct CompareRequest: Equatable { let token: String; let compare: Bool; let attempt: Int }

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

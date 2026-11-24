import ShelvrKit
import SwiftUI

struct PassportBadgeView: View {
  let cities: [PassportCityStamp]
  let completion: [PassportCompletion]
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var operation = SocialOperation()
  @State private var token: String?

  var body: some View {
    Section(copy("badges.title")) {
      SocialQuery(query: "subscriptions:getEntitlement", type: PassportEntitlement.self) { entitlement in
        let expiration = entitlement.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) }
        TimelineView(.explicit([Date()] + (expiration.map { [$0] } ?? []))) { clock in
          if entitlement.active(at: clock.date) {
            SocialQuery(query: "placeVisits:listBadgeStamps", type: [BadgeStamp].self) { stamps in
              let shown = PassportBadge.visible(stamps: stamps, cities: cities, completion: completion)
              ForEach(shown) { state in
                let title = copy("badges." + state.badge.id)
                if state.earned {
                  let message = copy("badges.shareMessage", ["badge": title])
                  if let token {
                    ShareLink(item: backend.passportURL(token: token), message: Text(message)) { label(title, state) }
                  } else {
                    ShareLink(item: message) { label(title, state) }
                  }
                } else { label(title, state) }
              }
            }
          } else {
            ForEach(PassportBadge.all) { badge in
              Button { operation.askToPurchase() } label: {
                Label(copy("badges." + badge.id), systemImage: "lock")
              }.accessibilityHint(copy("badges.lockedHint"))
            }
          }
        }
      }
    }
    .socialOperation(operation, failure: copy("errors.tryAgain"), close: copy("common.close"))
    .task {
      do {
        for try await result in backend.query("passportShares:myPassportShare", as: String?.self) {
          try Task.checkCancellation()
          token = result
        }
      } catch { if !Task.isCancelled { token = nil } }
    }
  }

  private func label(_ title: String, _ state: PassportBadge.Progress) -> some View {
    HStack {
      Label(title, systemImage: state.earned ? "medal.fill" : "medal")
      Spacer()
      if state.earned { Image(systemName: "square.and.arrow.up") }
      else { Text("\(state.have) / \(state.badge.goal)").monospacedDigit() }
    }
  }
}

import ShelvrKit
import SwiftUI

struct PassportBadgeView: View {
  let cities: [PassportCityStamp]
  let completion: [PassportCompletion]
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var operation = SocialOperation(placement: "passport")
  @State private var token: String?
  @State private var entitlement: PassportEntitlement?
  @State private var stamps: [BadgeStamp]?
  @State private var now = Date()
  @State private var failures = Set<String>()
  @State private var attempt = 0

  var body: some View {
    Section(copy("badges.title")) {
      VStack(alignment: .leading, spacing: 12) {
        if let entitlement {
          if let stamps {
            let locked = !entitlement.active(at: now)
            ForEach(PassportBadge.visible(stamps: stamps, cities: cities, completion: completion, locked: locked)) { state in
              let title = copy("badges.\(state.badge.id)")
              if locked {
                Button { operation.askToPurchase() } label: {
                  HStack {
                    Label(title, systemImage: "lock")
                    Spacer()
                    Text("\(state.have) / \(state.badge.goal)").monospacedDigit()
                  }
                }.buttonStyle(.borderless).accessibilityHint(copy("badges.lockedHint"))
              } else if state.earned {
                let message = copy("badges.shareMessage", ["badge": title])
                if let token {
                  ShareLink(item: backend.passportURL(token: token), message: Text(message)) { label(title, state) }
                } else { ShareLink(item: message) { label(title, state) } }
              } else { label(title, state) }
            }
          } else if failures.isEmpty { ProgressView() }
        } else if failures.isEmpty { ProgressView() }
        if !failures.isEmpty { Button(copy("common.retry")) { attempt += 1 } }
      }
      .task(id: attempt) {
        await watch("subscriptions:getEntitlement", PassportEntitlement.self) { entitlement = $0; now = Date() }
      }
      .task(id: attempt) {
        await watch("placeVisits:listBadgeStamps", [BadgeStamp].self) { stamps = $0 }
      }
      .task(id: entitlement?.expiresAt) {
        guard let ms = entitlement?.expiresAt else { return }
        let delay = ms / 1000 - Date().timeIntervalSince1970
        if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
        if !Task.isCancelled { now = Date() }
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

  private func watch<T: Decodable>(_ name: String, _ type: T.Type, set: (T) -> Void) async {
    failures.remove(name)
    do {
      for try await value in backend.query(name, as: type) {
        try Task.checkCancellation()
        set(value)
      }
    } catch { if !Task.isCancelled { failures.insert(name) } }
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

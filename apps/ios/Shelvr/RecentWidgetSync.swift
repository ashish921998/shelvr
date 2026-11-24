import ShelvrInbox
import ShelvrKit
import SwiftUI
import WidgetKit

struct RecentWidgetSync: ViewModifier {
  private struct Plan: Decodable {
    let status: String
    let expiresAt: Double?

    var expiration: Date? { expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
    var entitled: Bool {
      status == "lifetime" || (["trialing", "pro"].contains(status) && (expiration ?? .distantPast) > Date())
    }
  }

  private struct Card: Decodable {
    let _id: String
    let type: String
    let title: String?
    let note: String?
    let url: String?
  }

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var owner: String?
  @State private var plan: Plan?

  func body(content: Content) -> some View {
    content
      .task(id: backend.status) {
        if backend.status == .signedOut {
          owner = nil
          plan = nil
          publish(nil)
          return
        }
        guard backend.status == .signedIn else { return }
        do {
          for try await account in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
            try Task.checkCancellation()
            if owner != account?._id { owner = account?._id; plan = nil }
          }
        } catch {}
      }
      .task(id: owner) {
        guard let owner else { return }
        do {
          for try await current in backend.query("subscriptions:getEntitlement", as: Plan.self) {
            try Task.checkCancellation()
            guard self.owner == owner else { return }
            plan = current
            if !current.entitled { publish(nil) }
          }
        } catch {}
      }
      .task(id: "\(owner ?? "")-\(plan?.status ?? "")-\(plan?.expiresAt ?? 0)") {
        guard let owner, let plan, plan.entitled else { return }
        do {
          for try await cards in backend.query("items:listRecentItems", with: ["limit": 5.0], as: [Card].self) {
            try Task.checkCancellation()
            guard self.owner == owner, backend.status == .signedIn, plan.entitled else { return }
            let items = cards.map { card in
              let fallback = card.url.flatMap { URL(string: $0)?.host() }
                ?? copy(card.type == "image" ? "item.photo" : card.type == "note" ? "item.note" : "item.link")
              return RecentSavesSnapshot.Item(id: card._id, title: card.title ?? card.note?.components(separatedBy: .newlines).first ?? fallback,
                kind: card.type)
            }
            publish(RecentSavesSnapshot(owner: owner, items: items, expires: plan.status == "lifetime" ? nil : plan.expiration))
          }
        } catch {}
      }
  }

  private func publish(_ snapshot: RecentSavesSnapshot?) {
    guard let file = RecentSavesSnapshot.location else { return }
    do {
      if let snapshot {
        try JSONEncoder().encode(snapshot).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      } else if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
      WidgetCenter.shared.reloadTimelines(ofKind: "RecentSaves")
    } catch {}
  }
}

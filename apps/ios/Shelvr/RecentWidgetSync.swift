import ImageIO
import UniformTypeIdentifiers
import ShelvrInbox
import ShelvrKit
import SwiftUI
import WidgetKit

struct RecentWidgetSync: ViewModifier {
  private struct Plan: Decodable, Equatable {
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
    let siteName: String?
    let imageUrl: URL?
    let heroImageUrl: URL?
  }

  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
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
            if owner != account?._id {
              owner = account?._id
              plan = nil
              if let file = RecentSavesSnapshot.location,
                !RecentSavesSnapshot.canKeep(file, owner: owner) { publish(nil) }
              WidgetCenter.shared.reloadTimelines(ofKind: "RecentSaves")
            }
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
      .task(id: "\(phase)-\(owner ?? "")-\(plan?.status ?? "")-\(plan?.expiresAt ?? 0)") {
        guard phase == .active, let plan, plan.status != "lifetime", let expiry = plan.expiration else { return }
        do {
          try await Task.sleep(for: .seconds(max(0, expiry.timeIntervalSinceNow)))
          try Task.checkCancellation()
          if self.plan == plan && !plan.entitled { publish(nil) }
        } catch {}
      }
      .task(id: "\(owner ?? "")-\(plan?.status ?? "")-\(plan?.expiresAt ?? 0)") {
        guard let owner, let plan, plan.entitled else { return }
        do {
          for try await cards in backend.query("items:listRecentItems", with: ["limit": 5.0], as: [Card].self) {
            try Task.checkCancellation()
            guard self.owner == owner, self.plan == plan, backend.status == .signedIn, plan.entitled else { return }
            var items: [RecentSavesSnapshot.Item] = []
            for card in cards.prefix(5) {
              let host = card.url.flatMap { URL(string: $0)?.host() }
              let type = copy(card.type == "image" ? "item.photo" : card.type == "note" ? "item.note" : "item.link")
              let title = card.title ?? card.note?.components(separatedBy: .newlines).first ?? host ?? type
              let thumbnail = await WidgetThumbnail.load(card.imageUrl ?? card.heroImageUrl)
              try Task.checkCancellation()
              items.append(.init(id: card._id, title: title, kind: card.type,
                subtitle: card.siteName ?? host ?? type, thumbnail: thumbnail))
            }
            guard self.owner == owner, self.plan == plan, backend.status == .signedIn, plan.entitled else { return }
            publish(RecentSavesSnapshot(owner: owner, items: items, expires: plan.status == "lifetime" ? nil : plan.expiration?.addingTimeInterval(7 * 24 * 3600)))
          }
        } catch {}
      }
  }

  private func publish(_ snapshot: RecentSavesSnapshot?) {
    let invalidate = { WidgetCenter.shared.reloadTimelines(ofKind: "RecentSaves") }
    guard let file = RecentSavesSnapshot.location else { invalidate(); return }
    do {
      if let snapshot {
        try JSONEncoder().encode(snapshot).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        invalidate()
      } else {
        try RecentSavesSnapshot.clear(file, invalidate: invalidate)
      }
    } catch {}
  }
}

private enum WidgetThumbnail {
  static func load(_ url: URL?) async -> Data? {
    guard let url, url.scheme == "https" else { return nil }
    do {
      let (file, response) = try await URLSession.shared.download(for: URLRequest(url: url, timeoutInterval: 8))
      defer { try? FileManager.default.removeItem(at: file) }
      guard !Task.isCancelled, let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
        let source = CGImageSourceCreateWithURL(file as CFURL, nil),
        let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 512
        ] as CFDictionary)
      else { return nil }
      let buffer = NSMutableData()
      guard let output = CGImageDestinationCreateWithData(buffer, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
      CGImageDestinationAddImage(output, bitmap, [kCGImageDestinationLossyCompressionQuality: 0.75] as CFDictionary)
      return CGImageDestinationFinalize(output) ? buffer as Data : nil
    } catch { return nil }
  }
}

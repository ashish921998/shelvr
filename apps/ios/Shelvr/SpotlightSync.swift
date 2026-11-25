import AppIntents
import CoreSpotlight
import ShelvrKit
import SwiftUI

@MainActor enum ShelvrSpotlight {
  static let publication = SpotlightPublication(prepare: {
    guard let catalogs = UserDefaults(suiteName: "dev.expo.appintents") else { throw CocoaError(.fileReadNoPermission) }
    let legacy = LegacySearchCleanup(defaults: .standard, catalogs: catalogs, documents: .documentsDirectory, caches: .cachesDirectory)
    try await legacy.run { domains in
      try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: domains)
    }
  }, clear: {
    try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["ItemEntity", "shelvr.item"])
  }, remove: { ids in
    try await CSSearchableIndex.default().deleteAppEntities(identifiedBy: ids, ofType: ItemEntity.self)
  }, index: { rows, expiration in
    var items: [CSSearchableItem] = []
    for row in rows {
      let item = CSSearchableItem(appEntity: ItemEntity(row))
      item.expirationDate = expiration ?? .distantFuture
      items.append(item)
    }
    try await CSSearchableIndex.default().indexSearchableItems(items)
  }, failure: { Analytics.failure("spotlight_sync_failed") })
}

struct SpotlightSync: ViewModifier {
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
  @State private var granted: SpotlightPublication.Owner?
  @State private var attempt = 0
  @State private var failed = false

  private struct Session: Equatable {
    let generation: UUID
    let owner: String?
    let attempt: Int
  }

  func body(content: Content) -> some View {
    let session = Session(generation: backend.sessionGeneration, owner: backend.status == .signedIn ? backend.userID : nil, attempt: attempt)
    content.background {
      if let granted, granted.account == session.owner, granted.session == session.generation {
        SpotlightFeed(owner: granted).id(granted)
      }
    }
    .task(id: session) {
      apply(nil)
      failed = false
      guard let account = session.owner else { return }
      do {
        for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
          guard !Task.isCancelled, backend.userID == account, backend.sessionGeneration == session.generation else { return }
          let expires = plan.status == "lifetime" ? nil : plan.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) }
          apply(plan.entitled ? .init(account: account, session: session.generation, expiresAt: expires) : nil)
        }
      } catch {
        guard !Task.isCancelled, backend.sessionGeneration == session.generation else { return }
        apply(nil)
        failed = true
        Analytics.failure("spotlight_entitlement_failed")
      }
    }
    .task(id: granted) {
      guard let current = granted, let end = current.expiresAt else { return }
      do { try await Task.sleep(for: .seconds(max(0, end.timeIntervalSinceNow))) } catch { return }
      if !Task.isCancelled && granted == current && !current.active { apply(nil) }
    }
    .onChange(of: phase) { _, phase in
      guard phase == .active else { return }
      if let granted, !granted.active { apply(nil) }
      if failed { attempt += 1 }
    }
  }

  private func apply(_ next: SpotlightPublication.Owner?) {
    ShelvrSpotlight.publication.activate(next)
    granted = next
  }
}

private struct SpotlightFeed: View {
  let owner: SpotlightPublication.Owner
  @Environment(Backend.self) private var backend
  @State private var pages = SpotlightPages()

  var body: some View {
    ZStack {
      ForEach(pages.cursors, id: \.self) { cursor in
        Color.clear.task { await watch(cursor) }
      }
    }.allowsHitTesting(false).accessibilityHidden(true)
  }

  private func watch(_ cursor: SpotlightPages.Cursor) async {
    var delay = 2
    while !Task.isCancelled && owner.active && owner.session == backend.sessionGeneration && pages.cursors.contains(cursor) {
      do {
        for try await page in backend.spotlightPage(after: cursor.value) {
          guard !Task.isCancelled, owner.session == backend.sessionGeneration, owner.active else { return }
          if pages.receive(page, for: cursor), pages.isComplete { ShelvrSpotlight.publication.publish(pages.saves, for: owner) }
          delay = 2
        }
        return
      } catch {
        guard !Task.isCancelled, owner.session == backend.sessionGeneration else { return }
        pages.invalidate(cursor)
        ShelvrSpotlight.publication.publish([], for: owner)
        if delay == 2 { Analytics.failure("spotlight_page_failed") }
        do { try await Task.sleep(for: .seconds(delay)) } catch { return }
        delay = min(delay * 2, 60)
      }
    }
  }
}

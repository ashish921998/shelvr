import AppIntents
import CoreSpotlight
import ShelvrKit
import SwiftUI

@MainActor enum ShelvrSpotlight {
  static let publication = SpotlightPublication(prepare: prepare, clear: clear, remove: remove, index: index,
    failure: { Analytics.failure("spotlight_sync_failed") })

  static func reindex() async throws {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard backend.status == .signedIn, let account = backend.userID else {
      publication.activate(nil)
      try await publication.confirmed()
      return
    }
    let session = backend.sessionGeneration
    let initial = publication.revision
    func deny() async throws {
      publication.activate(nil)
      try await publication.confirmed()
    }
    func currentPlan() async throws -> ServerPlan {
      do {
        for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
          try Task.checkCancellation()
          guard backend.userID == account && backend.sessionGeneration == session else { throw CancellationError() }
          return plan
        }
        throw URLError(.cannotParseResponse)
      } catch {
        if !Task.isCancelled && backend.sessionGeneration == session { try await deny() }
        throw error
      }
    }
    guard try await currentPlan().entitled else { try await deny(); return }
    guard let rows = await SearchableSavePage.latestReady(fetch: { cursor in
      await firstPage(backend, cursor: cursor, session: session)
    }) else { throw URLError(.cannotLoadFromNetwork) }
    let plan = try await currentPlan()
    guard plan.entitled else { try await deny(); return }
    let expiry = plan.status == "lifetime" ? nil : plan.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) }
    let owner = SpotlightPublication.Owner(account: account, session: session, expiresAt: expiry)
    try await publication.reindex(rows, for: owner, observedRevision: initial)
  }

  private static func firstPage(_ backend: Backend, cursor: String?, session: UUID) async -> SearchableSavePage? {
    guard backend.sessionGeneration == session else { return nil }
    do {
      for try await page in backend.spotlightPage(after: cursor) { return page }
    } catch {}
    return nil
  }

  private static func prepare() async throws {
    guard let catalogs = UserDefaults(suiteName: "dev.expo.appintents") else { throw CocoaError(.fileReadNoPermission) }
    let legacy = LegacySearchCleanup(defaults: .standard, catalogs: catalogs, documents: .documentsDirectory, caches: .cachesDirectory)
    try await legacy.run { domains in
      try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: domains)
    }
  }

  private static func clear() async throws {
    try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["ItemEntity", "shelvr.item"])
  }

  private static func remove(_ ids: [String]) async throws {
    try await CSSearchableIndex.default().deleteAppEntities(identifiedBy: ids, ofType: ItemEntity.self)
  }

  private static func index(_ rows: [SearchableSave], expiration: Date?) async throws {
    let items = rows.map { row in
      let item = CSSearchableItem(appEntity: ItemEntity(row))
      item.expirationDate = expiration ?? .distantFuture
      return item
    }
    try await CSSearchableIndex.default().indexSearchableItems(items)
  }

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
          if pages.receive(page, for: cursor), let snapshot = pages.snapshot {
            ShelvrSpotlight.publication.publish(snapshot, for: owner)
          }
          delay = 2
        }
        return
      } catch {
        guard !Task.isCancelled, owner.session == backend.sessionGeneration else { return }
        pages.invalidate(cursor)
        if delay == 2 { Analytics.failure("spotlight_page_failed") }
        do { try await Task.sleep(for: .seconds(delay)) } catch { return }
        delay = min(delay * 2, 60)
      }
    }
  }
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
extension ItemQuery: IndexedEntityQuery {
  func reindexEntities(for identifiers: [String], indexDescription: CSSearchableIndexDescription) async throws {
    try await ShelvrSpotlight.reindex()
  }

  func reindexAllEntities(indexDescription: CSSearchableIndexDescription) async throws {
    try await ShelvrSpotlight.reindex()
  }
}
#endif

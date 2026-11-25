import AppIntents
import CoreSpotlight
import Observation
import ShelvrKit

@MainActor @Observable final class SpotlightSystemRequests {
  static let shared = SpotlightSystemRequests()
  private(set) var accessRetry = 0
  @ObservationIgnored private var monitoring = false
  private let backend = AppEnvironment.sharedBackend
  private var publication: SpotlightPublication { ShelvrSpotlight.publication }

  func monitorIdentity() {
    guard !monitoring else { return }
    monitoring = true
    trackIdentity()
  }

  private func trackIdentity() {
    withObservationTracking {
      _ = backend.status
      _ = backend.userID
      _ = backend.sessionGeneration
      publication.verifyIdentity()
    } onChange: {
      Task { @MainActor in self.trackIdentity() }
    }
  }

  func reindex() async throws {
    monitorIdentity()
    try await publication.prepareForSystemRequest()
    await backend.start()
    guard backend.status == .signedIn, let account = backend.userID else {
      try await deny()
      return
    }
    let session = backend.sessionGeneration
    guard let owner = try await access(account: account, session: session) else { try await deny(); return }
    let request = try await publication.beginReindex(for: owner)
    guard let rows = await SearchableSavePage.latestReady(fetch: { cursor in
      await self.page(after: cursor, owner: owner)
    }) else { throw URLError(.cannotLoadFromNetwork) }
    guard let final = try await access(account: account, session: session) else { try await deny(); return }
    guard final == owner else { accessRetry += 1; throw CancellationError() }
    try await publication.finishReindex(rows, request: request)
  }

  private func access(account: String, session: UUID) async throws -> SpotlightPublication.Owner? {
    do {
      for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) {
        try Task.checkCancellation()
        guard backend.userID == account, backend.sessionGeneration == session else { throw CancellationError() }
        guard plan.entitled else { return nil }
        let expiry = plan.status == "lifetime" ? nil : plan.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) }
        return .init(account: account, session: session, expiresAt: expiry)
      }
      throw URLError(.cannotParseResponse)
    } catch {
      if !Task.isCancelled && backend.userID == account && backend.sessionGeneration == session { try await deny() }
      throw error
    }
  }

  private func deny() async throws {
    publication.activate(nil)
    accessRetry += 1
    try await publication.confirmSystemWrite()
  }

  private func page(after cursor: String?, owner: SpotlightPublication.Owner) async -> SearchableSavePage? {
    guard backend.userID == owner.account && backend.sessionGeneration == owner.session && owner.active else { return nil }
    do {
      for try await page in backend.spotlightPage(after: cursor) { return page }
    } catch {}
    return nil
  }
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
extension ItemQuery: IndexedEntityQuery {
  func reindexEntities(for identifiers: [String], indexDescription: CSSearchableIndexDescription) async throws {
    try await SpotlightSystemRequests.shared.reindex()
  }

  func reindexAllEntities(indexDescription: CSSearchableIndexDescription) async throws {
    try await SpotlightSystemRequests.shared.reindex()
  }
}
#endif

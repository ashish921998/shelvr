import AppIntents
import CoreSpotlight
import Observation
import ShelvrKit

@MainActor @Observable final class SpotlightSystemRequests {
  static let shared = SpotlightSystemRequests()
  private(set) var accessRetry = 0
  @ObservationIgnored private var monitoring = false
  private let queue = SpotlightReindexQueue()
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
    try await queue.run { try await self.rebuild() }
  }

  private func rebuild() async throws {
    monitorIdentity()
    try await publication.prepareForSystemRequest()
    await backend.start()
    let session = backend.sessionGeneration
    guard backend.status == .signedIn, let account = backend.userID else {
      try await deny(account: backend.userID, session: session)
      return
    }
    guard let owner = try await access(account: account, session: session) else {
      try await deny(account: account, session: session)
      return
    }
    let request = try await publication.beginReindex(for: owner)
    guard let rows = await SearchableSavePage.latestReady(fetch: { cursor in
      await self.page(after: cursor, owner: owner)
    }) else { throw URLError(.cannotLoadFromNetwork) }
    try await verify(request, account: account, session: session)
    do {
      try await publication.finishReindex(rows, request: request) {
        try await self.access(account: account, session: session)
      }
    } catch {
      retryViewIfRevoked(request, account: account, session: session)
      throw error
    }
  }

  private func verify(_ request: SpotlightPublication.ReindexRequest, account: String, session: UUID) async throws {
    let grant = try await access(account: account, session: session)
    do { try await publication.validate(request, grant: grant) }
    catch {
      retryViewIfRevoked(request, account: account, session: session)
      throw error
    }
  }

  private func retryViewIfRevoked(_ request: SpotlightPublication.ReindexRequest, account: String, session: UUID) {
    if backend.userID == account && backend.sessionGeneration == session && publication.needsReauthorization(after: request) {
      accessRetry += 1
    }
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
      if !Task.isCancelled && backend.userID == account && backend.sessionGeneration == session {
        try await deny(account: account, session: session)
      }
      throw error
    }
  }

  private func deny(account: String?, session: UUID) async throws {
    guard backend.userID == account && backend.sessionGeneration == session else { throw CancellationError() }
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

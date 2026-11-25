import Foundation

@MainActor public final class SpotlightPublication {
  public struct Owner: Hashable, Sendable {
    public let account: String
    public let session: UUID
    public let expiresAt: Date?
    public init(account: String, session: UUID, expiresAt: Date? = nil) {
      self.account = account
      self.session = session
      self.expiresAt = expiresAt
    }
    public var active: Bool { expiresAt.map { $0 > .now } ?? true }
  }

  public typealias Clear = @MainActor () async throws -> Void
  public typealias Remove = @MainActor ([String]) async throws -> Void
  public typealias Index = @MainActor ([SearchableSave], Date?) async throws -> Void

  private let prepare: Clear
  private let clear: Clear
  private let remove: Remove
  private let index: Index
  private let failure: @MainActor () -> Void
  private var mayHaveIndexedItems = true
  private var owner: Owner?
  private var desired: [SearchableSave] = []
  private var applied: [String: SearchableSave] = [:]
  private var needsReset = true
  private var prepared = false
  private var revision: UInt64 = 0
  private var tail: Task<Void, Never>?
  private var retry: Task<Void, Never>?
  private var backoff = 2

  public init(prepare: @escaping Clear, clear: @escaping Clear,
    remove: @escaping Remove, index: @escaping Index, failure: @escaping @MainActor () -> Void) {
    self.prepare = prepare
    self.clear = clear
    self.remove = remove
    self.index = index
    self.failure = failure
  }

  public func activate(_ next: Owner?) {
    if next == owner && prepared && !needsReset { return }
    let changing = next != owner
    if changing {
      owner = next
      desired = []
      needsReset = true
    }
    let urgent: Task<Void, Never>?
    if changing && tail != nil && mayHaveIndexedItems {
      urgent = Task { try? await self.clear() }
    } else { urgent = nil }
    schedule(after: urgent)
  }

  public func publish(_ rows: [SearchableSave], for source: Owner) {
    guard source == owner, rows != desired || needsReset else { return }
    desired = rows
    schedule()
  }

  public func refresh() {
    needsReset = true
    schedule()
  }

  public func settled() async {
    while let tail { await tail.value }
  }

  private func schedule(after urgent: Task<Void, Never>? = nil) {
    retry?.cancel()
    retry = nil
    revision += 1
    let job = revision
    let prior = tail
    tail = Task {
      await prior?.value
      await urgent?.value
      guard job == revision else { return }
      do {
        try await flush(job)
        if revision == job { backoff = 2 }
      } catch {
        needsReset = true
        if job == revision {
          if backoff == 2 { failure() }
          let delay = backoff
          backoff = min(backoff * 2, 60)
          retry = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self, self.revision == job else { return }
            self.schedule()
          }
        }
      }
      if revision == job { tail = nil }
    }
  }

  private func flush(_ job: UInt64) async throws {
    if !prepared {
      try await prepare()
      prepared = true
    }
    guard job == revision else { return }
    if needsReset {
      if mayHaveIndexedItems { try await clear() }
      applied = [:]
      mayHaveIndexedItems = false
      guard job == revision else { return }
      needsReset = false
    }
    guard let owner else { return }
    guard owner.active else { activate(nil); return }
    let removed = Set(applied.keys).subtracting(desired.map(\._id))
    if !removed.isEmpty {
      try await remove(Array(removed))
      for id in removed { applied.removeValue(forKey: id) }
    }
    guard job == revision else { return }
    let changed = desired.filter { applied[$0._id] != $0 }
    for offset in stride(from: 0, to: changed.count, by: 100) {
      guard job == revision else { return }
      guard owner.active else { activate(nil); return }
      let batch = Array(changed[offset..<min(offset+100, changed.count)])
      mayHaveIndexedItems = true
      try await index(batch, owner.expiresAt)
      for row in batch { applied[row._id] = row }
    }
    if applied.isEmpty { mayHaveIndexedItems = false }
  }
}

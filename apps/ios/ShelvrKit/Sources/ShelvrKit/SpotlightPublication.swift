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
  public typealias Index = @MainActor ([SpotlightEntry], Date?) async throws -> Void

  private let prepare: Clear
  private let clear: Clear
  private let remove: Remove
  private let index: Index
  private let failure: @MainActor () -> Void
  private var mayHaveIndexedItems = true
  private var owner: Owner?
  private var desired: [SearchableSave] = []
  private var applied: [String: SpotlightEntry] = [:]
  private var wantedImages = Set<SpotlightThumbnail>()
  private var images: [SpotlightThumbnail: Data] = [:]
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
      wantedImages = []
      images = [:]
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
    wantedImages = Set(SpotlightThumbnail.candidates(in: rows))
    images = images.filter { wantedImages.contains($0.key) }
    schedule()
  }

  public func needsThumbnail(_ request: SpotlightThumbnail, for source: Owner) -> Bool {
    owner == source && source.active && wantedImages.contains(request) && images[request] == nil
  }

  public func acceptThumbnail(_ data: Data, for request: SpotlightThumbnail, owner source: Owner) {
    guard !data.isEmpty, needsThumbnail(request, for: source) else { return }
    images[request] = data
    schedule()
  }

  public func thumbnail(for row: SearchableSave, account: String?, session: UUID) -> Data? {
    guard let owner, owner.account == account, owner.session == session, owner.active,
      let request = SpotlightThumbnail(row) else { return nil }
    return images[request]
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
    tail = Task { [self] in
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
    let changed = desired.compactMap { row -> SpotlightEntry? in
      let thumbnail = SpotlightThumbnail(row).flatMap { images[$0] }
      let entry = SpotlightEntry(save: row, thumbnail: thumbnail)
      return entry == applied[row._id] ? nil : entry
    }
    for offset in stride(from: 0, to: changed.count, by: 100) {
      guard job == revision else { return }
      guard owner.active else { activate(nil); return }
      let batch = Array(changed[offset..<min(offset+100, changed.count)])
      mayHaveIndexedItems = true
      try await index(batch, owner.expiresAt)
      for entry in batch { applied[entry.save._id] = entry }
    }
    if applied.isEmpty { mayHaveIndexedItems = false }
  }
}

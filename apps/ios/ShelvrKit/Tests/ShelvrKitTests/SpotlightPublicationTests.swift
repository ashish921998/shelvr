import Foundation
import Testing
@testable import ShelvrKit

private func spotlightRow(_ id: String, _ title: String = "Fixture", status: String = "ready") throws -> SearchableSave {
  let fields: [String: Any] = ["_id": id, "_creationTime": 0, "type": "note", "status": status, "title": title]
  return try JSONDecoder().decode(SearchableSave.self, from: JSONSerialization.data(withJSONObject: fields))
}

@Test func changedCursorsDropOldTailSubscriptionsAndIgnoreTheirLateRows() throws {
  var pages = SpotlightPages()
  let a = try spotlightRow("a"), b = try spotlightRow("b"), c = try spotlightRow("c")
  _ = pages.receive(.init(page: [a], continueCursor: "tail", isDone: false), for: .start)
  _ = pages.receive(.init(page: [a, b], continueCursor: "end", isDone: true), for: .after("tail"))
  #expect(pages.snapshot?.map(\._id) == ["a", "b"])
  _ = pages.receive(.init(page: [c], continueCursor: "new", isDone: false), for: .start)
  #expect(pages.cursors == [.start, .after("new")])
  #expect(pages.snapshot == nil)
  let late = pages.receive(.init(page: [a, b], continueCursor: "end", isDone: true), for: .after("tail"))
  #expect(!late && pages.snapshot == nil)
  pages.invalidate(.start)
  #expect(pages.cursors == [.start] && pages.snapshot == nil)
}

@MainActor private func observed(_ predicate: () -> Bool) async -> Bool {
  let until = ContinuousClock.now.advanced(by: .seconds(5))
  while !predicate() && ContinuousClock.now < until {
    try? await Task.sleep(for: .milliseconds(5))
  }
  return predicate()
}

@MainActor private final class TestSearchIndex {
  var items = [String: SearchableSave]()
  var cleared = 0
  var indexed = [[String]]()
  var expirations: [Date?] = []
  var thumbnails = [String: Data]()
  var removed = [[String]]()
  var prepareCount = 0
  var fail = false
  var blocked: CheckedContinuation<Void, Never>?
  var willBlock = false
  var failures = 0

  func make(isCurrent: @escaping @MainActor (SpotlightPublication.Owner) -> Bool = { _ in true }) -> SpotlightPublication {
    SpotlightPublication(prepare: { self.prepareCount += 1 }, clear: {
      self.cleared += 1
      self.items.removeAll()
      self.thumbnails.removeAll()
    }, remove: { ids in
      self.removed.append(ids)
      for id in ids { self.items.removeValue(forKey: id); self.thumbnails.removeValue(forKey: id) }
    }, index: { rows, expiration in
      self.expirations.append(expiration)
      if self.willBlock {
        self.willBlock = false
        await withCheckedContinuation { self.blocked = $0 }
      }
      self.indexed.append(rows.map(\.save._id))
      for entry in rows {
        self.items[entry.save._id] = entry.save
        self.thumbnails[entry.save._id] = entry.thumbnail
      }
      if self.fail { throw URLError(.cannotWriteToFile) }
    }, isCurrent: isCurrent, failure: { self.failures += 1 })
  }
}

@MainActor @Test func spotlightUpdatesOnlyChangedRowsAndClearsOldSessionsAcrossRelaunch() async throws {
  let os = TestSearchIndex(), a = SpotlightPublication.Owner(account: "a", session: UUID())
  let b = SpotlightPublication.Owner(account: "b", session: UUID())
  let index = os.make()
  let one = try spotlightRow("1"), two = try spotlightRow("2"), edited = try spotlightRow("2", "Edited")
  index.activate(a)
  index.publish([one, two], for: a)
  await index.settled()
  index.publish([one, two], for: a)
  index.publish([edited], for: a)
  await index.settled()
  #expect(os.indexed == [["1", "2"], ["2"]] && os.removed == [["1"]])
  index.activate(b)
  index.publish([one], for: a)
  await index.settled()
  #expect(os.items.isEmpty)
  index.publish([two], for: b)
  await index.settled()
  let relaunched = os.make()
  relaunched.activate(nil)
  await relaunched.settled()
  #expect(os.items.isEmpty && os.prepareCount == 2)
}

@MainActor @Test func revocationClearsBeforeAndAfterAPreviousWriteFinishes() async throws {
  let os = TestSearchIndex(), a = SpotlightPublication.Owner(account: "a", session: UUID())
  let index = os.make()
  os.willBlock = true
  index.activate(a)
  index.publish([try spotlightRow("1")], for: a)
  let started = await observed { os.blocked != nil }
  try #require(started)
  index.activate(nil)
  let revoked = await observed { os.cleared >= 2 }
  #expect(revoked)
  os.blocked?.resume()
  await index.settled()
  #expect(os.cleared == 3 && os.items.isEmpty)
}

@MainActor @Test func aPartiallyFailedIndexIsErasedBeforeTheNextSnapshotIsPublished() async throws {
  let os = TestSearchIndex(), a = SpotlightPublication.Owner(account: "a", session: UUID())
  let index = os.make()
  os.fail = true
  index.activate(a)
  index.publish([try spotlightRow("old")], for: a)
  await index.settled()
  #expect(os.failures == 1)
  os.fail = false
  index.publish([try spotlightRow("new")], for: a)
  await index.settled()
  #expect(Set(os.items.keys) == ["new"] && os.cleared == 2)
}

@MainActor @Test func theSystemReceivesTheEntitlementDeadlineWithEachIndexedBatch() async throws {
  let os = TestSearchIndex(), deadline = Date().addingTimeInterval(3600)
  let owner = SpotlightPublication.Owner(account: "a", session: UUID(), expiresAt: deadline)
  let index = os.make()
  index.activate(owner)
  index.publish([try spotlightRow("1")], for: owner)
  await index.settled()
  #expect(os.expirations == [deadline])
}

@MainActor @Test func thumbnailsOnlyEnrichCurrentImagesInTheCurrentAccount() async throws {
  func image(_ id: String, _ source: String) throws -> SearchableSave {
    let fields: [String: Any] = ["_id": id, "_creationTime": 0, "type": "image", "status": "ready", "imageUrl": source]
    return try JSONDecoder().decode(SearchableSave.self, from: JSONSerialization.data(withJSONObject: fields))
  }
  let rows = try (0...60).map { try image(String($0), "https://example.org/\($0)") }
  let requests = SpotlightThumbnail.candidates(in: rows)
  #expect(requests.count == 60 && requests.last?.id == "59")
  let os = TestSearchIndex(), index = os.make()
  let user = SpotlightPublication.Owner(account: "a", session: UUID())
  index.activate(user)
  index.publish(rows, for: user)
  await index.settled()
  #expect(os.items.count == 61 && os.thumbnails.isEmpty)
  let first = requests[0], bytes = Data([1, 2])
  index.acceptThumbnail(bytes, for: first, owner: user)
  await index.settled()
  #expect(os.thumbnails == ["0": bytes])
  #expect(index.thumbnail(for: rows[0], account: "a", session: user.session) == bytes)
  #expect(index.thumbnail(for: rows[0], account: "b", session: user.session) == nil)
  let replacement = try image("0", "https://example.org/new")
  index.publish([replacement], for: user)
  index.acceptThumbnail(bytes, for: first, owner: user)
  await index.settled()
  #expect(os.thumbnails.isEmpty)
  let newer = try #require(SpotlightThumbnail(replacement))
  index.activate(nil)
  index.acceptThumbnail(bytes, for: newer, owner: user)
  await index.settled()
  #expect(os.thumbnails.isEmpty && os.items.isEmpty)
  #expect(!index.needsThumbnail(newer, for: user))
}

@MainActor @Test func headlessColdPreparationErasesOrphansBeforeRequestingAnyData() async throws {
  let os = TestSearchIndex(), index = os.make()
  os.items["orphan"] = try spotlightRow("orphan")
  try await index.prepareForSystemRequest()
  #expect(os.cleared == 1 && os.items.isEmpty)
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let request = try await index.beginReindex(for: owner)
  index.activate(owner)
  try await index.finishReindex([try spotlightRow("valid")], request: request)
  #expect(Set(os.items.keys) == ["valid"])
}

@MainActor @Test func aNewerCompleteSnapshotWinsEvenWhenTheCatalogIsEmpty() async throws {
  let os = TestSearchIndex(), index = os.make()
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let request = try await index.beginReindex(for: owner)
  index.publish([], for: owner)
  try await index.finishReindex([try spotlightRow("stale")], request: request)
  #expect(os.items.isEmpty)
  let next = try await index.beginReindex(for: owner)
  index.publish([try spotlightRow("new")], for: owner)
  try await index.finishReindex([try spotlightRow("stale")], request: next)
  #expect(Set(os.items.keys) == ["new"])
}

@MainActor @Test func aRevokedReindexCannotRestoreRowsWhileTheViewIsAbsent() async throws {
  let os = TestSearchIndex()
  final class Gate { var allowed = true }
  let gate = Gate()
  let index = os.make(isCurrent: { _ in gate.allowed })
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let request = try await index.beginReindex(for: owner)
  os.willBlock = true
  let job = Task { try await index.finishReindex([try spotlightRow("old")], request: request) }
  let started = await observed { os.blocked != nil }
  try #require(started)
  gate.allowed = false
  index.verifyIdentity()
  let revoked = await observed { os.cleared >= 2 }
  #expect(revoked)
  os.blocked?.resume()
  await #expect(throws: CancellationError.self) { try await job.value }
  await index.settled()
  #expect(os.items.isEmpty)
  gate.allowed = true
  index.activate(owner)
  await #expect(throws: CancellationError.self) { try await index.finishReindex([try spotlightRow("old")], request: request) }
}

@MainActor @Test func failedSystemWritesAreReportedToTheReindexCaller() async throws {
  let os = TestSearchIndex(), index = os.make()
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let request = try await index.beginReindex(for: owner)
  os.fail = true
  await #expect(throws: CocoaError.self) { try await index.finishReindex([try spotlightRow("partial")], request: request) }
  index.activate(nil)
  await index.settled()
  #expect(os.items.isEmpty)
}

@MainActor @Test func concurrentSystemCallbacksCannotRestoreARowMissingFromTheNewerRead() async throws {
  let os = TestSearchIndex(), index = os.make()
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let older = try await index.beginReindex(for: owner)
  let newer = try await index.beginReindex(for: owner)
  await #expect(throws: CancellationError.self) { try await index.finishReindex([try spotlightRow("deleted")], request: older) }
  try await index.finishReindex([], request: newer)
  #expect(os.items.isEmpty)
}

@MainActor @Test func aShortenedOrRevokedGrantClearsPreviouslyWrittenRowsBeforeReturning() async throws {
  let os = TestSearchIndex(), index = os.make()
  let owner = SpotlightPublication.Owner(account: "a", session: UUID())
  let short = SpotlightPublication.Owner(account: owner.account, session: owner.session, expiresAt: Date().addingTimeInterval(3600))
  for grant: SpotlightPublication.Owner? in [short, nil] {
    let request = try await index.beginReindex(for: owner)
    try await index.finishReindex([try spotlightRow("private")], request: request)
    #expect(os.items.count == 1)
    await #expect(throws: CancellationError.self) { try await index.validate(request, grant: grant) }
    #expect(os.items.isEmpty)
  }
}

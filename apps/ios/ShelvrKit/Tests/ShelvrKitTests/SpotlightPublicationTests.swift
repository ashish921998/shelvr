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
  #expect(pages.saves.map(\._id) == ["a", "b"])
  _ = pages.receive(.init(page: [c], continueCursor: "new", isDone: false), for: .start)
  #expect(pages.cursors == [.start, .after("new")])
  #expect(pages.saves == [c])
  let late = pages.receive(.init(page: [a, b], continueCursor: "end", isDone: true), for: .after("tail"))
  #expect(!late && pages.saves == [c])
  pages.invalidate(.start)
  #expect(pages.cursors == [.start] && pages.saves.isEmpty)
}

@MainActor private final class TestSearchIndex {
  var items = [String: SearchableSave]()
  var cleared = 0
  var indexed = [[String]]()
  var removed = [[String]]()
  var prepareCount = 0
  var fail = false
  var blocked: CheckedContinuation<Void, Never>?
  var willBlock = false
  var failures = 0

  func make() -> SpotlightPublication {
    SpotlightPublication(prepare: { self.prepareCount += 1 }, clear: {
      self.cleared += 1
      self.items.removeAll()
    }, remove: { ids in
      self.removed.append(ids)
      for id in ids { self.items.removeValue(forKey: id) }
    }, index: { rows in
      if self.willBlock {
        self.willBlock = false
        await withCheckedContinuation { self.blocked = $0 }
      }
      self.indexed.append(rows.map(\._id))
      for row in rows { self.items[row._id] = row }
      if self.fail { throw URLError(.cannotWriteToFile) }
    }, failure: { self.failures += 1 })
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
  while os.blocked == nil { await Task.yield() }
  index.activate(nil)
  while os.cleared < 2 { await Task.yield() }
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

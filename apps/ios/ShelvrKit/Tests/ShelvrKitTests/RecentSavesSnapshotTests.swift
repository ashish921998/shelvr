import Foundation
import ShelvrInbox
import Testing

@Test func widgetShowsContentOnlyForItsOwnerBeforeExpiration() {
  let expiry = Date(timeIntervalSince1970: 200)
  let recent = RecentSavesSnapshot(owner: "first", items: [], expires: expiry)
  #expect(recent.visible(to: "first", at: expiry.addingTimeInterval(-1)))
  #expect(!recent.visible(to: "first", at: expiry))
  #expect(!recent.visible(to: "second", at: expiry.addingTimeInterval(-1)))
  #expect(!recent.visible(to: nil, at: expiry.addingTimeInterval(-1)))
  #expect(RecentSavesSnapshot(owner: "first", items: [], expires: nil).visible(to: "first", at: .distantFuture))
}

@Test func widgetRoutesAndCardCountsMatchTheInstalledWidget() {
  let all = (0..<6).map { RecentSavesSnapshot.Item(id: String($0), title: String($0), kind: "link") }
  let populated = RecentSavesSnapshot(owner: "a", items: all, expires: nil)
  let empty = RecentSavesSnapshot(owner: "a", items: [], expires: nil)
  #expect(RecentSavesSnapshot.destination(scheme: "shelvr", snapshot: nil)?.absoluteString == "shelvr:///")
  #expect(RecentSavesSnapshot.destination(scheme: "shelvr-preview", snapshot: empty)?.absoluteString == "shelvr-preview:///add")
  #expect(RecentSavesSnapshot.destination(scheme: "shelvr", snapshot: populated)?.absoluteString == "shelvr:///")
  #expect(populated.displayed(small: true).map(\.id) == ["0","1","2","3"])
  #expect(populated.displayed(small: false).map(\.id) == ["0","1","2","3","4"])
}

@Test func preservesAValidColdStartSnapshotAndClearsOnlyOwnedThumbnails() throws {
  let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: root) }
  let old = root.appending(path: "ExpoWidgets")
  try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
  let file = root.appending(path: "SwiftRecentSaves.json")
  try JSONEncoder().encode(RecentSavesSnapshot(owner: "a", items: [], expires: nil)).write(to: file)
  #expect(RecentSavesSnapshot.canKeep(file, owner: "a"))
  #expect(!RecentSavesSnapshot.canKeep(file, owner: "b"))
  let thumb = old.appending(path: "recent-saves-test.jpg")
  let unrelated = old.appending(path: "other.jpg")
  try Data().write(to: thumb)
  try Data().write(to: unrelated)
  try RecentSavesSnapshot.clear(file)
  #expect(!FileManager.default.fileExists(atPath: thumb.path))
  #expect(!FileManager.default.fileExists(atPath: file.path))
  #expect(FileManager.default.fileExists(atPath: unrelated.path))
}

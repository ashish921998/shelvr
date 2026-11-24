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

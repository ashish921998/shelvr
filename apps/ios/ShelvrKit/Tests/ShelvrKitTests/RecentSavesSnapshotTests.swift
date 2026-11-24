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

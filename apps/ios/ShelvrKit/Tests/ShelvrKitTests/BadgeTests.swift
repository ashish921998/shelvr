import Foundation
import Testing
@testable import ShelvrKit

@Test func badgeProgressCountsDistinctKindsAndPicksTheClosestNextGoal() {
  let stamps = (1...5).map { _ in BadgeStamp(city: "Lisbon", countryCode: "PT", kinds: ["coffee", "coffee", "food"]) }
  let rows = PassportBadge.visible(stamps: stamps, cities: [], completion: [.init(city: "Lisbon", stamped: 5, total: 5)])
  #expect(rows.filter(\.earned).map(\.id) == ["firstStamp", "completionist", "coffeeCrawler"])
  #expect(rows.last?.id == "explorer")
  #expect(rows.last?.have == 5)
  let locked = PassportBadge.visible(stamps: stamps, cities: [], completion: [], locked: true)
  #expect(locked.count == PassportBadge.all.count)
  #expect(locked.first { $0.id == "coffeeCrawler" }?.have == 5)
}

@Test func expiredOrMissingSubscriptionExpiryDoesNotUnlockMilestones() {
  let date = Date(timeIntervalSince1970: 10)
  #expect(PassportEntitlement(status: "lifetime", expiresAt: nil).active(at: date))
  #expect(PassportEntitlement(status: "trialing", expiresAt: 10001).active(at: date))
  #expect(!PassportEntitlement(status: "pro", expiresAt: 10000).active(at: date))
  #expect(!PassportEntitlement(status: "pro", expiresAt: nil).active(at: date))
}

@Test func visibleBadgeRowsMatchExpo() throws {
  struct Vector: Decodable {
    struct Expected: Decodable { let id: String; let have: Int }
    let stamps: [BadgeStamp]
    let cities: [PassportCityStamp]
    let completion: [PassportCompletion]
    let expected: [Expected]
  }
  let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().appending(path: "TestData/passport-badges.json")
  let row = try JSONDecoder().decode(Vector.self, from: Data(contentsOf: file))
  let visible = PassportBadge.visible(stamps: row.stamps, cities: row.cities, completion: row.completion)
  #expect(visible.map(\.id) == row.expected.map(\.id))
  #expect(visible.map(\.have) == row.expected.map(\.have))
}

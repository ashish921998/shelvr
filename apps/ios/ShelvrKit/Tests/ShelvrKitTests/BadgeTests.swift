import Foundation
import Testing
@testable import ShelvrKit

@Test func badgeProgressCountsDistinctKindsAndPicksTheClosestNextGoal() {
  let stamps = (1...5).map { _ in BadgeStamp(city: "Lisbon", countryCode: "PT", kinds: ["coffee", "coffee", "food"]) }
  let rows = PassportBadge.visible(stamps: stamps, cities: [], completion: [.init(city: "Lisbon", stamped: 5, total: 5)])
  #expect(rows.filter(\.earned).map(\.id) == ["firstStamp", "completionist", "coffeeCrawler"])
  #expect(rows.last?.id == "explorer")
  #expect(rows.last?.have == 5)
}

@Test func expiredOrMissingSubscriptionExpiryDoesNotUnlockMilestones() {
  let date = Date(timeIntervalSince1970: 10)
  #expect(PassportEntitlement(status: "lifetime", expiresAt: nil).active(at: date))
  #expect(PassportEntitlement(status: "trialing", expiresAt: 10001).active(at: date))
  #expect(!PassportEntitlement(status: "pro", expiresAt: 10000).active(at: date))
  #expect(!PassportEntitlement(status: "pro", expiresAt: nil).active(at: date))
}

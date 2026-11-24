import Foundation
import Testing
@testable import ShelvrKit

@Test func backFromSkippedShareResumesThePracticeStep() throws {
  var progress = OnboardingProgress()
  progress.step = .ahaShare
  progress.advance(skipping: true)
  #expect(progress.step == .ahaSpots)
  var restored = try JSONDecoder().decode(OnboardingProgress.self, from: JSONEncoder().encode(progress))
  #expect(restored.demoOperationID == progress.demoOperationID)
  restored.back()
  #expect(restored.step == .ahaShare)
  restored.advance()
  #expect(!restored.skippedShare)
  #expect(restored.step == .firstSave)
}

@Test func skippingReplacesAFormerAnswer() {
  var progress = OnboardingProgress()
  progress.step = .goal
  progress.advance(skipping: true)
  #expect(progress.goals == ["date", "travel", "food"])
  progress.visitedCities = ["lisbon"]
  progress.advance(skipping: true)
  #expect(progress.visitedCities.isEmpty)
}

@Test func replayPreservesTheOtherPendingWriteInEitherOrder() throws {
  let url = try #require(URL(string: "https://example.com/reel"))
  let original = OnboardingHandoff(cities: ["lisbon"], url: url, operation: "link:fixture", space: nil)
  let afterStamp = try #require(original.remaining(afterStamps: true))
  #expect(afterStamp.url == url && afterStamp.operation == original.operation)
  #expect(afterStamp.remaining(afterStamps: false) == nil)
  let afterSave = try #require(original.remaining(afterStamps: false))
  #expect(afterSave.cities == original.cities && afterSave.url == nil)
  #expect(afterSave.remaining(afterStamps: true) == nil)
}

@Test func practiceReelUsesAnAvailableFreeSaveOrWaitsForAccess() {
  #expect(OnboardingHandoff.canSave(pro: false, freeOpen: true, remaining: 1))
  #expect(!OnboardingHandoff.canSave(pro: false, freeOpen: true, remaining: 0))
  #expect(!OnboardingHandoff.canSave(pro: false, freeOpen: false, remaining: 1))
  #expect(OnboardingHandoff.canSave(pro: true, freeOpen: false, remaining: 0))
}

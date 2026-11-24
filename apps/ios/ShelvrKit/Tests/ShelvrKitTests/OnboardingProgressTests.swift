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

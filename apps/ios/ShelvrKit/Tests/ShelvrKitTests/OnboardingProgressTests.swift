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

@Test func aWelcomeDraftFollowsOnlyTheNewAccountThatFinishedTheQuestions() throws {
  let suite = UUID().uuidString
  let defaults = try #require(UserDefaults(suiteName: suite))
  defer { defaults.removePersistentDomain(forName: suite) }
  var progress = OnboardingProgress()
  progress.city = "lisbon"
  progress.step = .notifications
  progress.awaitingAccountAccess = true
  let data = try JSONEncoder().encode(progress)
  defaults.set(data, forKey: WelcomeHandoff.progressKey(nil))
  WelcomeHandoff.apply(.afterQuestions, to: "chosen", defaults: defaults)
  let stored = try #require(defaults.data(forKey: WelcomeHandoff.progressKey("chosen")))
  let resumed = try JSONDecoder().decode(OnboardingProgress.self, from: stored)
  #expect(resumed.city == "lisbon" && resumed.awaitingAccountAccess == true)
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey(nil)) == nil)
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey("other")) == nil)
  #expect(!defaults.bool(forKey: "swift.onboarded.chosen"))
}

@Test func existingAccountSignInSkipsQuestionsWithoutClaimingAnotherAccountsDraft() throws {
  let suite = UUID().uuidString
  let defaults = try #require(UserDefaults(suiteName: suite))
  defer { defaults.removePersistentDomain(forName: suite) }
  for account: String? in [nil, "chosen", "other"] {
    defaults.set(Data([1]), forKey: WelcomeHandoff.progressKey(account))
  }
  WelcomeHandoff.apply(.existing, to: "chosen", defaults: defaults)
  #expect(defaults.bool(forKey: "swift.onboarded.chosen") && defaults.bool(forKey: WelcomeHandoff.finishedKey))
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey("chosen")) == nil)
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey(nil)) == nil)
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey("other")) == Data([1]))
  defaults.set(Data([2]), forKey: WelcomeHandoff.progressKey(nil))
  WelcomeHandoff.apply(.afterQuestions, to: "chosen", defaults: defaults)
  #expect(defaults.data(forKey: WelcomeHandoff.progressKey("chosen")) == nil)
}

@Test func aRestoredLoginConsumesOnlyTheWelcomeChoiceForItsVerifiedSession() throws {
  let suite = UUID().uuidString
  let before = try #require(UserDefaults(suiteName: suite))
  defer { before.removePersistentDomain(forName: suite) }
  let after = try #require(UserDefaults(suiteName: suite))
  let draft = WelcomeHandoff.progressKey(nil)
  before.set(Data([1]), forKey: draft)
  WelcomeHandoff.stage(.afterQuestions, subject: "a|old", defaults: before)
  WelcomeHandoff.consume(subject: "a|different", account: "a", defaults: after)
  #expect(after.data(forKey: WelcomeHandoff.progressKey("a")) == nil)
  #expect(after.data(forKey: draft) == Data([1]))
  WelcomeHandoff.stage(.afterQuestions, subject: "b|new", defaults: before)
  WelcomeHandoff.consume(subject: "b|new", account: "b", defaults: after)
  #expect(after.data(forKey: WelcomeHandoff.progressKey("b")) == Data([1]))
  after.set(Data([2]), forKey: draft)
  WelcomeHandoff.consume(subject: "b|new", account: "b", defaults: after)
  #expect(after.data(forKey: draft) == Data([2]))
  WelcomeHandoff.stage(.existing, subject: "a|returning", defaults: before)
  WelcomeHandoff.consume(subject: "a|returning", account: "a", defaults: after)
  #expect(after.bool(forKey: "swift.onboarded.a"))
}

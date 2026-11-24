import Foundation
import Testing
@testable import ShelvrKit

@Test func surveyResponsesKeepTheExistingReasonAndOutcomeContract() {
  #expect(CancelSurveyResponse.allCases.filter { $0.outcome == "submitted" }.map(\.rawValue) ==
    ["too_expensive", "not_useful_enough", "missing_feature", "other"])
  #expect(CancelSurveyResponse.skipped.outcome == "dismissed")
  #expect(CancelSurveyResponse(rawValue: "unknown") == nil)
}

@Test func libraryReentryRequiresFreshCancellationEligibilityEvenWhenTheSceneStayedActive() {
  var state = CancelSurveyEligibility.cancelled
  #expect(state.forVisit(home: true, active: true) == .cancelled)
  state = state.forVisit(home: false, active: true)
  #expect(state == .unchecked)
  #expect(state.forVisit(home: true, active: true) == .unchecked)
  #expect(CancelSurveyEligibility.ineligible.forVisit(home: true, active: false) == .unchecked)
}

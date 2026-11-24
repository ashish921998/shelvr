import Foundation
import Testing
@testable import ShelvrKit

@Test func surveyResponsesKeepTheExistingReasonAndOutcomeContract() {
  #expect(CancelSurveyResponse.allCases.filter { $0.outcome == "submitted" }.map(\.rawValue) ==
    ["too_expensive", "not_useful_enough", "missing_feature", "other"])
  #expect(CancelSurveyResponse.skipped.outcome == "dismissed")
  #expect(CancelSurveyResponse(rawValue: "unknown") == nil)
}

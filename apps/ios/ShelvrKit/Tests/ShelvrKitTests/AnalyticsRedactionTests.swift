import Foundation
import Testing
@testable import ShelvrKit

@Test func crashReportsDropNestedDiagnosticsAndInvalidExceptionNames() throws {
  let diagnostic = "private synthetic text"
  let result = AnalyticsRedaction.properties([
    "$exception_message": diagnostic, "$exception_list": [
      ["type": diagnostic, "value": diagnostic, "mechanism": ["meta": ["signal": ["crash_info_message": diagnostic]]]]
    ],
  ], event: "$exception")
  let data = try JSONSerialization.data(withJSONObject: result)
  #expect(String(decoding: data, as: UTF8.self).contains(diagnostic) == false)
  #expect(result["$exception_message"] == nil)
  #expect(AnalyticsRedaction.properties(["url": "private"], event: "Application Opened").isEmpty)
}

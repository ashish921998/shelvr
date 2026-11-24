import Foundation
import Testing
@testable import ShelvrKit

@Test func usesTheExistingExpoInstallationAndAPNsRequestShape() throws {
  let request = ExpoPushRequest(bundleID: "app.shelvr.save.preview", apns: Data([0, 10, 255]),
    installation: "ABC", development: true)
  let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
  #expect(object["deviceToken"] as? String == "000aff")
  #expect(object["type"] as? String == "apns")
  #expect(object["deviceId"] as? String == "abc")
  #expect(object["development"] as? Bool == true)
  #expect(object["projectId"] as? String == "c6c97aa7-6676-47a1-8ffc-9a1339c2bc19")
}

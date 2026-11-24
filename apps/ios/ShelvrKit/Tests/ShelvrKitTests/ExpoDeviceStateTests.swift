import Foundation
import Security
import Testing
@testable import ShelvrKit

struct ExpoDeviceStateTests {
  @Test func readsExistingStateWithoutConsumingIt() throws {
    let suite = UUID().uuidString
    let defaults = try #require(UserDefaults(suiteName: suite))
    let groupName = UUID().uuidString
    let group = try #require(UserDefaults(suiteName: groupName))
    defer {
      defaults.removePersistentDomain(forName: suite)
      group.removePersistentDomain(forName: groupName)
    }
    defaults.set("legacy-id", forKey: "EXDeviceInstallationUUIDKey")
    let queue = Data("[{}]".utf8)
    defaults.set(queue, forKey: "dev.expo.appintents.invocations.pending")
    group.set(queue, forKey: "expo-sharing")
    let state = ExpoDeviceState(bundleID: "app.shelvr.save.dev", deployment: URL(string: "https://dev.convex.cloud")!,
      defaults: defaults, group: group) { query in
        guard let service = query[kSecAttrService as String] as? String else { return nil }
        if service == "shelvr.app-intents.capture", query[kSecAttrAccount as String] as? String == "credentials" {
          return Data(#"{"siteUrl":"https://dev.convex.site","token":"fixture"}"#.utf8)
        }
        guard let key = query[kSecAttrAccount as String] as? Data,
          query[kSecAttrGeneric as String] as? Data == key else { return nil }
        let slots = ["shelvr.onboarded": "true", "notification-install-secret": "secret",
                     "notification-tokens-https___dev.convex.cloud": #"["fixture"]"#,
                     "shelvr.pending.share": "1", "shelvr.discarded.share": "discarded"]
        return service == "app" ? slots[String(decoding: key, as: UTF8.self)].map { Data($0.utf8) } : nil
      }
    #expect(state.onboarded)
    #expect(state.installationID == "legacy-id")
    #expect(state.installSecret == "secret")
    #expect(try state.notificationTokens() == ["fixture"])
    #expect(try state.captureCredentials()?.token == "fixture")
    #expect(state.pendingInvocations == queue)
    #expect(state.hasPendingShare && state.discardedShare == "discarded")
    #expect(state.pendingSharePayloads == queue)
    #expect(group.data(forKey: "expo-sharing") == queue)
  }
}

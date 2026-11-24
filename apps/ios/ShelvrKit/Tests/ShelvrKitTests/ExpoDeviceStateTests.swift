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
    let queue = Data(#"[{"id":"queued","name":"saveImages","params":{"paths":["image"],"operationIds":["op"]},"createdAt":1}]"#.utf8)
    let shares = Data(#"[{"type":"url","value":"https://example.org","mimeType":"text/plain"}]"#.utf8)
    defaults.set(queue, forKey: "dev.expo.appintents.invocations.pending")
    group.set(shares, forKey: "expo-sharing")
    let env = try AppEnvironment(infoDictionary: ["CFBundleIdentifier": "app.shelvr.save.dev", "ShelvrConvexURL": "https://dev.convex.cloud"])
    #expect(env.appGroup == "group.app.shelvr.save.dev")
    let state = ExpoDeviceState(environment: env,
      defaults: defaults, group: group) { query in
        guard let service = query[kSecAttrService as String] as? String else { return nil }
        if service == "shelvr.app-intents.capture", query[kSecAttrAccount as String] as? String == "credentials" {
          return Data(#"{"siteUrl":"https://dev.convex.site","token":"fixture"}"#.utf8)
        }
        guard let key = query[kSecAttrAccount as String] as? Data,
          query[kSecAttrGeneric as String] as? Data == key else { return nil }
        if service == env.bundleID {
          switch String(decoding: key, as: UTF8.self) {
          case "EXDeviceInstallationUUIDKey": return Data("keychain-id".utf8)
          case "EXNotificationRegistrationInfoKey":
            return Data(#"{"isEnabled":true,"lastRegisteredDeviceToken":{"deviceToken":"device","development":true,"type":"apns","registeredAt":1}}"#.utf8)
          default: return nil
          }
        }
        if service == "app:no-auth", key == Data("shelvr.onboarded".utf8) { return Data("true".utf8) }
        let slots = ["notification-install-secret": "secret",
                     "notification-tokens-https___dev.convex.cloud": #"["fixture"]"#,
                     "shelvr.pending.share": "1", "shelvr.discarded.share": "discarded"]
        return service == "app" ? slots[String(decoding: key, as: UTF8.self)].map { Data($0.utf8) } : nil
      }
    #expect(state.onboarded)
    #expect(state.installationID == "keychain-id")
    #expect(state.installSecret == "secret")
    #expect(try state.notificationTokens() == ["fixture"])
    #expect(try state.captureCredentials()?.token == "fixture")
    #expect(try state.registrationInfo()?.lastRegisteredDeviceToken?.deviceToken == "device")
    #expect(try state.pendingInvocations().first?.params.operationIds == ["op"])
    #expect(state.hasPendingShare && state.discardedShare == "discarded")
    #expect(try state.pendingSharePayloads().first?.type == .url)
    #expect(group.data(forKey: "expo-sharing") == shares)
  }

  @Test func clearedCurrentValueMasksLegacyAndMalformedRecordsThrow() throws {
    let suite = UUID().uuidString
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("legacy-id", forKey: "EXDeviceInstallationUUIDKey")
    let env = try AppEnvironment(variant: .development, convexURL: URL(string: "https://dev.convex.cloud")!, bundleID: "app.shelvr.save.preview")
    let state = ExpoDeviceState(environment: env, defaults: defaults, group: defaults) { query in
      switch query[kSecAttrService as String] as? String {
      case "app:no-auth": return Data()
      case "app": return Data("true".utf8)
      default: return nil
      }
    }
    #expect(!state.onboarded)
    #expect(state.installationID == "legacy-id")
    #expect(try state.registrationInfo() == nil)
    #expect(try state.pendingInvocations().isEmpty)
    defaults.set(Data("[{}]".utf8), forKey: "expo-sharing")
    #expect(throws: DecodingError.self) { try state.pendingSharePayloads() }
  }

  @Test func invocationParamsOfAnyJSONTypeDoNotBreakTheQueue() throws {
    let suite = UUID().uuidString
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let queue = Data(
      #"[{"id":"q","name":"saveText","params":{"text":"hi","id":7,"count":3,"meta":{"a":1}},"createdAt":1}]"#.utf8)
    defaults.set(queue, forKey: "dev.expo.appintents.invocations.pending")
    let env = try AppEnvironment(
      variant: .development, convexURL: URL(string: "https://dev.convex.cloud")!, bundleID: "app.shelvr.save.preview")
    let state = ExpoDeviceState(environment: env, defaults: defaults, group: defaults) { _ in nil }
    let params = try #require(try state.pendingInvocations().first?.params)
    #expect(params.text == "hi")
    #expect(params.id == nil)
  }
}

import Foundation
import UIKit
import OSLog
import PostHog
import ShelvrKit

@MainActor
enum Analytics {
  private static var enabled = false
  private static var identity = AnalyticsIdentity()
  private static var foreground = false
  private static var opened = false
  private static var unidentifiedOfflineID: String?
  private static var notificationOpens = PushNotificationOpenBuffer()
  private static let identifiedKey = "swift.analytics.identified"

  static var available: Bool { enabled && !PostHogSDK.shared.isOptOut() }

  static func start() {
    guard !enabled else { return }
    guard let token = Bundle.main.object(forInfoDictionaryKey: "ShelvrPostHogToken") as? String,
      !token.isEmpty, let host = Bundle.main.object(forInfoDictionaryKey: "ShelvrPostHogHost") as? String,
      !host.isEmpty else {
      #if DEBUG
      Logger(subsystem: "app.shelvr.save", category: "analytics").warning("PostHog build configuration missing")
      #endif
      return
    }
    let config = PostHogConfig(projectToken: token, host: host)
    let environment = AppEnvironment.current.variant == .production ? "production" : "development"
    config.captureApplicationLifecycleEvents = false
    config.captureScreenViews = false
    config.capturePushNotificationSubscriptions = false
    config.capturePushNotificationOpened = false
    config.errorTrackingConfig.autoCapture = AppEnvironment.current.variant == .production
    config.setBeforeSend { event in
      event.properties["environment"] = environment
      event.properties["analytics_version"] = 1
      event.properties = AnalyticsRedaction.properties(event.properties, event: event.event)
      return event
    }
    PostHogSDK.shared.setup(config)
    enabled = true
    registerContext()
  }

  static func identify(_ id: String?, authenticated: Bool = false) {
    guard enabled else { return }
    unidentifiedOfflineID = nil
    let result = identity.update(id, authenticated: authenticated)
    if let id {
      if result.identify { PostHogSDK.shared.identify(id) }
      if result.complete { capture("auth_completed") }
      UserDefaults.standard.set(true, forKey: identifiedKey)
    } else if UserDefaults.standard.bool(forKey: identifiedKey) {
      PostHogSDK.shared.reset()
      UserDefaults.standard.removeObject(forKey: identifiedKey)
      registerContext()
    }
    reconcile()
  }

  static func restoredOffline(accountID: String?) {
    guard enabled else { return }
    if let accountID {
      identify(accountID)
      return
    }
    if unidentifiedOfflineID == nil { unidentifiedOfflineID = UUID().uuidString }
    reconcile()
  }

  private static func reconcile() {
    let pendingOpens = notificationOpens.reconcile()
    if UIApplication.shared.applicationState == .active { active(true) }
    for properties in pendingOpens { capture("notification_opened", properties) }
  }

  static func notificationOpened(_ properties: [String: String]) {
    guard enabled, let ready = notificationOpens.record(properties) else { return }
    capture("notification_opened", ready)
  }

  static var sessionID: String? { available ? PostHogSDK.shared.getSessionId() : nil }

  static func active(_ active: Bool) {
    guard enabled, notificationOpens.reconciled, active != foreground else { return }
    foreground = active
    let defaults = UserDefaults.standard
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    let properties = ["build": build, "version": version]
    if active {
      let previous = defaults.string(forKey: "swift.analytics.build")
      if previous != build {
        let expoStorage = URL.documentsDirectory.appending(path: ".posthog-rn.json")
        let updated = previous != nil || FileManager.default.fileExists(atPath: expoStorage.path)
        capture(updated ? "Application Updated" : "Application Installed", properties)
        defaults.set(build, forKey: "swift.analytics.build")
      }
      capture("Application Opened", ["version": version, "build": build, "from_background": opened])
      opened = true
    } else {
      capture("Application Backgrounded")
    }
  }

  static func capture(_ event: String, _ properties: [String: Any] = [:], distinctId: String? = nil) {
    guard enabled else { return }
    PostHogSDK.shared.capture(event, distinctId: distinctId ?? unidentifiedOfflineID, properties: properties)
  }

  static func itemOpened(_ save: LibrarySave, source: String?) {
    guard var properties = ItemAnalytics.properties(save) else { return }
    properties["source"] = ItemAnalytics.source(source)
    capture("item_opened", properties)
  }

  static func itemAction(_ save: LibrarySave, _ action: String) {
    guard var properties = ItemAnalytics.properties(save) else { return }
    properties["action"] = action
    capture("item_action", properties)
  }

  static func itemDeleted(_ save: LibrarySave, surface: String) {
    guard var properties = ItemAnalytics.properties(save) else { return }
    properties["surface"] = surface
    capture("item_deleted", properties)
  }

  static func failure(_ event: String) {
    guard enabled else { return }
    PostHogSDK.shared.captureException(NSError(domain: "Shelvr", code: 1), properties: [
      "error_event": event, "$exception_fingerprint": event, "$issue_name": event
    ])
  }

  private static func registerContext() {
    PostHogSDK.shared.register(["analytics_version": 1, "environment":
      AppEnvironment.current.variant == .development ? "development" : "production"])
  }
}

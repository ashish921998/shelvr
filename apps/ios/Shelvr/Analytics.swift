import Foundation
import UIKit
import OSLog
import PostHog
import ShelvrKit

@MainActor
enum Analytics {
  private static var enabled = false
  private static var identifiedUser: String?
  private static var reconciled = false
  private static var foreground = false
  private static var opened = false
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

  static func identify(_ id: String?) {
    guard enabled else { return }
    if let id {
      if identifiedUser != id {
        PostHogSDK.shared.identify(id)
        identifiedUser = id
        capture("auth_completed")
      }
      UserDefaults.standard.set(true, forKey: identifiedKey)
    } else if UserDefaults.standard.bool(forKey: identifiedKey) {
      identifiedUser = nil
      PostHogSDK.shared.reset()
      UserDefaults.standard.removeObject(forKey: identifiedKey)
      registerContext()
    }
    reconciled = true
    if UIApplication.shared.applicationState == .active { active(true) }
  }

  static var sessionID: String? { enabled ? PostHogSDK.shared.getSessionId() : nil }

  static func active(_ active: Bool) {
    guard enabled, reconciled, active != foreground else { return }
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

  static func capture(_ event: String, _ properties: [String: Any] = [:]) {
    guard enabled else { return }
    PostHogSDK.shared.capture(event, properties: properties)
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

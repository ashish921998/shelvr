import Foundation
import OSLog
import PostHog
import ShelvrKit

@MainActor
enum Analytics {
  private static var enabled = false
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
    config.captureScreenViews = false
    config.capturePushNotificationSubscriptions = false
    config.capturePushNotificationOpened = false
    config.errorTrackingConfig.autoCapture = AppEnvironment.current.variant == .production
    config.setBeforeSend { event in
      if event.event == "Application Opened" { event.properties.removeValue(forKey: "url") }
      if event.event == "$exception" {
        event.properties.removeValue(forKey: "$exception_message")
        if let exceptions = event.properties["$exception_list"] as? [[String: Any]] {
          event.properties["$exception_list"] = exceptions.map { info in
            var safe = info
            safe["value"] = info["type"] as? String ?? "Error"
            return safe
          }
        }
      }
      return event
    }
    PostHogSDK.shared.setup(config)
    enabled = true
    registerContext()
  }

  static func identify(_ id: String?) {
    guard enabled else { return }
    if let id {
      PostHogSDK.shared.identify(id)
      UserDefaults.standard.set(true, forKey: identifiedKey)
    } else if UserDefaults.standard.bool(forKey: identifiedKey) {
      PostHogSDK.shared.reset()
      UserDefaults.standard.removeObject(forKey: identifiedKey)
      registerContext()
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

import ShelvrKit
import SwiftUI
import UserNotifications

@MainActor
final class PushDevice: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, ObservableObject {
  @Published var token: Data?
  @Published var link: AppLink?

  func application(_ application: UIApplication,
    didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    token = deviceToken
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .list])
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void) {
    let info = response.notification.request.content.userInfo
    let data = info["body"] as? [String: Any]
    let path = data?["url"] as? String ?? info["url"] as? String
    if let path, let parsed = AppLink(path) {
      let kind = data?["kind"] as? String ?? info["kind"] as? String ?? "unknown"
      let id = data?["notificationId"] as? String ?? info["notificationId"] as? String ?? ""
      Task { @MainActor in
        Analytics.capture("notification_opened", ["notification_kind": kind, "notification_id": id])
        self.link = parsed
      }
    }
    completionHandler()
  }
}

struct PushRegistrationView: ViewModifier {
  @ObservedObject var device: PushDevice
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase
  @Environment(\.copy) private var copy

  private struct Request: Hashable {
    let token: Data?
    let session: UUID
    let active: Bool
  }

  func body(content: Content) -> some View {
    content.task(id: Request(token: device.token, session: backend.sessionGeneration, active: phase == .active)) {
      guard let bundle = Bundle.main.bundleIdentifier else { return }
      if backend.status == .signedOut {
        UIApplication.shared.unregisterForRemoteNotifications()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        if let installation = try? PushInstallation(bundleID: bundle) {
          try? await backend.finishPushRevocation(installation: installation)
        }
        return
      }
      guard phase == .active, backend.status == .signedIn else { return }
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
      UIApplication.shared.registerForRemoteNotifications()
      guard let token = device.token else { return }
      do {
        let install = try PushInstallation(bundleID: bundle)
        let development = Bundle.main.object(forInfoDictionaryKey: "ShelvrAPNsEnvironment") as? String == "development"
        let expo = try await ExpoPushRequest(bundleID: bundle, apns: token, installation: install.id,
          development: development).exchange()
        try Task.checkCancellation()
        try await backend.registerPush(expo, installation: install, locale: copy.locale)
      } catch { if !Task.isCancelled { Analytics.failure("notification_registration_failed") } }
    }
  }
}

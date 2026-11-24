import ShelvrKit
import SwiftUI
import UserNotifications

@MainActor
final class PushDevice: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, ObservableObject {
  @Published var token: Data?
  @Published var link: AppLink?
  @Published private(set) var authorizationRevision = 0
  @Published private(set) var blockedSession: UUID?

  func retryEnrollment() {
    blockedSession = nil
    authorizationRevision += 1
  }

  func rejectOwnership(for session: UUID) {
    blockedSession = session
    suspendEnrollment()
  }

  func suspendEnrollment() {
    UIApplication.shared.unregisterForRemoteNotifications()
    UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    if token != nil { token = nil }
  }

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
    if let path, let parsed = AppLink(path) { Task { @MainActor in self.link = parsed } }
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
    let authorizationRevision: Int
  }

  func body(content: Content) -> some View {
    content.task(id: Request(token: device.token, session: backend.sessionGeneration, active: phase == .active,
      authorizationRevision: device.authorizationRevision)) {
      let generation = backend.sessionGeneration
      if backend.status == .signedOut { device.suspendEnrollment() }
      guard backend.status == .signedOut || (phase == .active && device.blockedSession != generation && backend.mayRegisterPush(generation)),
        let bundle = Bundle.main.bundleIdentifier,
        let installation = await cleanInstallation(bundle, generation: generation),
        backend.mayRegisterPush(generation) else { return }

      let settings = await UNUserNotificationCenter.current().notificationSettings()
      guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus),
        !Task.isCancelled, backend.mayRegisterPush(generation) else { return }
      UIApplication.shared.registerForRemoteNotifications()
      guard let token = device.token else { return }
      do {
        let development = Bundle.main.object(forInfoDictionaryKey: "ShelvrAPNsEnvironment") as? String == "development"
        let expo = try await ExpoPushRequest(bundleID: bundle, apns: token, installation: installation.id,
          development: development).exchange()
        try Task.checkCancellation()
        try await backend.registerPush(expo, installation: installation, locale: copy.locale, generation: generation)
      } catch PushRegistrationError.ownedByAnotherAccount {
        if backend.mayRegisterPush(generation) { device.rejectOwnership(for: generation) }
      } catch {}
    }
  }

  private func cleanInstallation(_ bundle: String, generation: UUID) async -> PushInstallation? {
    var delay = 2
    while !Task.isCancelled, backend.sessionGeneration == generation {
      do {
        let installation = try PushInstallation(bundleID: bundle)
        try await backend.finishPushRevocation(installation: installation, generation: generation, locale: copy.locale, suspend: device.suspendEnrollment)
        try Task.checkCancellation()
        return installation
      } catch PushRegistrationError.ownedByAnotherAccount {
        if backend.mayRegisterPush(generation) { device.rejectOwnership(for: generation) }
        return nil
      } catch is CancellationError { return nil }
      catch {
        guard !Task.isCancelled, backend.sessionGeneration == generation else { return nil }
        device.suspendEnrollment()
        do { try await Task.sleep(for: .seconds(delay)) } catch { return nil }
        delay = min(60, delay * 2)
      }
    }
    return nil
  }
}

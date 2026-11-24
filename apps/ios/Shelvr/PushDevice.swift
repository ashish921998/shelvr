import ShelvrKit
import SwiftUI
import UserNotifications

@MainActor
final class PushDevice: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, ObservableObject {
  @Published private(set) var delivery = PushDeliveryState()
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

  private func silence() {
    UIApplication.shared.unregisterForRemoteNotifications()
    UNUserNotificationCenter.current().getDeliveredNotifications { delivered in
      let ids = delivered.map(\.request).filter { !Self.isLocalTrial($0) }.map(\.identifier)
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
    }
  }

  func suspendEnrollment() {
    silence()
    delivery = PushDeliveryState()
  }

  func currentToken(generation: UUID, verified: Set<String>) -> Data? {
    let wasProbing = delivery.isProbing
    if delivery.prepare(generation: generation, verified: verified) { silence() }
    if delivery.token == nil || (wasProbing && delivery.permitsPresentation) {
      UIApplication.shared.registerForRemoteNotifications()
    }
    return delivery.token
  }

  func permitDelivery(_ token: Data, generation: UUID) {
    if delivery.confirm(token, generation: generation) { UIApplication.shared.registerForRemoteNotifications() }
  }

  func application(_ application: UIApplication,
    didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    if delivery.receive(deviceToken) { silence() }
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    if delivery.isProbing { silence() }
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
    async -> UNNotificationPresentationOptions {
    if Self.isLocalTrial(notification.request) { return [.banner, .list] }
    return await MainActor.run { delivery.permitsPresentation ? [.banner, .list] : [] }
  }

  private nonisolated static func isLocalTrial(_ request: UNNotificationRequest) -> Bool {
    request.trigger is UNCalendarNotificationTrigger && TrialNotification.Kind(rawValue: request.identifier) != nil
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
    content.task(id: Request(token: device.delivery.token, session: backend.sessionGeneration, active: phase == .active,
      authorizationRevision: device.authorizationRevision)) {
      let generation = backend.sessionGeneration
      if backend.status == .signedOut { device.suspendEnrollment() }
      guard backend.status == .signedOut || (phase == .active && device.blockedSession != generation && backend.mayRegisterPush(generation)),
        let bundle = Bundle.main.bundleIdentifier,
        let (installation, verified) = await cleanInstallation(bundle, generation: generation),
        backend.mayRegisterPush(generation) else { return }

      let settings = await UNUserNotificationCenter.current().notificationSettings()
      guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus),
        !Task.isCancelled, backend.mayRegisterPush(generation) else { return }
      do {
        try await PushRetry.run(while: { backend.mayRegisterPush(generation) && device.blockedSession != generation }) {
          try await submit(bundle, installation: installation, verified: verified, generation: generation)
        }
      } catch {}
    }
  }

  private func submit(_ bundle: String, installation: PushInstallation, verified: Set<String>, generation: UUID) async throws {
    guard let token = device.currentToken(generation: generation, verified: verified) else { throw URLError(.resourceUnavailable) }
    let current = { backend.mayRegisterPush(generation) && device.delivery.token == token }
    let development = Bundle.main.object(forInfoDictionaryKey: "ShelvrAPNsEnvironment") as? String == "development"
    let expo = try await ExpoPushRequest(bundleID: bundle, apns: token, installation: installation.id,
      development: development).exchange()
    try Task.checkCancellation()
    guard current() else { throw CancellationError() }
    do {
      try await backend.registerPush(expo, native: token, installation: installation, locale: copy.locale, generation: generation)
    } catch PushRegistrationError.ownedByAnotherAccount {
      if !Task.isCancelled, current() { device.rejectOwnership(for: generation) }
      throw PushRegistrationError.ownedByAnotherAccount
    }
    if !Task.isCancelled, current() { device.permitDelivery(token, generation: generation) }
  }

  private func cleanInstallation(_ bundle: String, generation: UUID) async -> (PushInstallation, Set<String>)? {
    do {
      return try await PushRetry.run(while: { backend.sessionGeneration == generation }) {
        do {
          let installation = try PushInstallation(bundleID: bundle)
          let verified = try await backend.finishPushRevocation(installation: installation, generation: generation, suspend: device.suspendEnrollment)
          try Task.checkCancellation()
          return (installation, verified)
        } catch {
          if !Task.isCancelled, backend.sessionGeneration == generation { device.suspendEnrollment() }
          throw error
        }
      }
    } catch { return nil }
  }
}

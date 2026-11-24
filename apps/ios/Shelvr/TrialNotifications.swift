import ShelvrKit
import SwiftUI
import UserNotifications

@MainActor
final class LocalTrialNotifications {
  static let shared = LocalTrialNotifications()
  private var revision = 0
  private var pending: Task<Void, Never>?

  func replace(_ notices: [TrialNotification], copy: Copy) {
    revision += 1
    let current = revision
    let previous = pending
    pending = Task {
      await previous?.value
      guard current == revision else { return }
      let center = UNUserNotificationCenter.current()
      let ids = TrialNotification.Kind.allCases.map(\.rawValue)
      center.removePendingNotificationRequests(withIdentifiers: ids)
      if notices.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
      let permission = await center.notificationSettings().authorizationStatus
      guard [.authorized, .provisional, .ephemeral].contains(permission) else { return }
      for notice in notices {
        guard current == revision else { return }
        let content = UNMutableNotificationContent()
        let route: String
        switch notice.kind {
        case .ending:
          content.title = copy("notifications.trialEndingTitle", count: 2)
          content.body = copy("notifications.trialEndingBody")
          route = "/profile"
        case .lastDay:
          content.title = copy("notifications.trialLastDayTitle")
          content.body = copy("notifications.trialLastDayBody")
          route = "/profile"
        case .dayOne:
          content.title = copy("notifications.trialFirstDayTitle")
          content.body = copy("notifications.trialFirstDayBody")
          route = "/add"
        case .dayThree:
          content.title = copy("notifications.trialThirdDayTitle")
          content.body = copy("notifications.trialThirdDayBody")
          route = "/"
        }
        content.sound = .default
        content.userInfo = ["url": route, "kind": route == "/profile" ? "trial_reminder" : "trial_nudge",
          "notificationId": notice.kind.rawValue]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let components = calendar.dateComponents([.calendar, .timeZone, .year, .month, .day, .hour, .minute, .second], from: notice.date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        try? await center.add(.init(identifier: notice.kind.rawValue, content: content, trigger: trigger))
      }
    }
  }
}

struct TrialNotificationPreferences: Decodable, Equatable {
  let weeklyShelfEnabled: Bool
  let remindersEnabled: Bool
}

struct TrialReminderObserver: ViewModifier {
  private struct Subscription: Decodable, Equatable { let status: String; let expiresAt: Double? }
  private struct Inputs: Equatable {
    let subscription: Subscription?
    let nudges: Bool?
    let active: Bool
    let user: String?
  }
  private struct PrimerInputs: Equatable {
    let session: TrialNotification.ObserverSession
    let canPresent: Bool
  }

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.scenePhase) private var phase
  @State private var subscription: Subscription?
  @State private var preferences: TrialNotificationPreferences?
  @State private var mayAsk = false
  @State private var primer = false
  let home: Bool

  func body(content: Content) -> some View {
    let session = TrialNotification.ObserverSession(generation: backend.sessionGeneration, account: backend.userID)
    content
      .task(id: session) {
        await observe("subscriptions:getEntitlement", as: Subscription.self, session: session) { subscription = $0 }
      }
      .task(id: session) {
        await observe("notifications:getPreferences", as: TrialNotificationPreferences.self, session: session) { preferences = $0 }
      }
      .onChange(of: Inputs(subscription: subscription, nudges: preferences?.remindersEnabled,
        active: phase == .active, user: backend.userID), initial: true) { before, value in
        if let id = value.user, TrialNotification.shouldArmPrimer(
          previousAccount: before.user, previousStatus: before.subscription?.status,
          account: id, status: value.subscription?.status
        ) {
          let key = "trial-primer-" + id
          if UserDefaults.standard.string(forKey: key) != "asked" { UserDefaults.standard.set("owed", forKey: key) }
        }
        refresh(value)
      }
      .task(id: PrimerInputs(session: session, canPresent: home && mayAsk && phase == .active && !primer)) {
        await presentIfPossible()
      }
      .alert(copy("notifications.trialPrimerTitle"), isPresented: $primer) {
        Button(copy("notifications.trialPrimerAllow")) {
          let session = backend.sessionGeneration
          Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            if backend.status == .signedIn && backend.sessionGeneration == session {
              refresh(.init(subscription: subscription, nudges: preferences?.remindersEnabled, active: true, user: backend.userID))
            }
          }
        }
        Button(copy("common.notNow"), role: .cancel) {}
      } message: { Text(copy("notifications.trialPrimerBody")) }
  }

  private func observe<Value: Decodable>(_ name: String, as type: Value.Type,
    session: TrialNotification.ObserverSession, receive: (Value) -> Void) async {
    guard let owner = session.account else { return }
    func current() -> Bool {
      backend.status == .signedIn && session.canContinue(generation: backend.sessionGeneration, account: backend.userID)
    }
    do {
      try await PushRetry.run(while: current) {
        guard backend.userID == owner else { throw URLError(.userAuthenticationRequired) }
        for try await value in backend.query(name, as: type) {
          try Task.checkCancellation()
          guard current() else { throw CancellationError() }
          if backend.userID == owner { receive(value) }
        }
        throw URLError(.networkConnectionLost)
      }
    } catch {}
  }

  private func refresh(_ inputs: Inputs) {
    guard let sub = inputs.subscription, let user = inputs.user, backend.userID == user else { return }
    guard sub.status == "trialing", let end = sub.expiresAt else {
      mayAsk = false
      primer = false
      LocalTrialNotifications.shared.replace([], copy: copy)
      return
    }
    guard inputs.active else { return }
    let notices = TrialNotification.schedule(expiration: Date(timeIntervalSince1970: end / 1000), now: .now,
      nudges: inputs.nudges)
    mayAsk = notices.contains { $0.kind == .ending }
    LocalTrialNotifications.shared.replace(notices, copy: copy)
  }

  private func presentIfPossible() async {
    guard home, mayAsk, phase == .active, let user = backend.userID, !primer else { return }
    let key = "trial-primer-" + user
    guard UserDefaults.standard.string(forKey: key) == "owed" else { return }
    let session = backend.sessionGeneration
    let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    guard !Task.isCancelled, session == backend.sessionGeneration, backend.userID == user,
      UserDefaults.standard.string(forKey: key) == "owed" else { return }
    UserDefaults.standard.set("asked", forKey: key)
    if status == .notDetermined { primer = true }
  }
}

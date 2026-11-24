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
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.scenePhase) private var phase
  @State private var subscription: Subscription?
  @State private var preferences: TrialNotificationPreferences?
  @State private var user: String?
  @State private var mayAsk = false
  @State private var primer = false
  let home: Bool

  func body(content: Content) -> some View {
    content
      .task {
        do {
          for try await entry in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) { user = entry?._id }
        } catch {}
      }
      .task {
        do {
          for try await value in backend.query("subscriptions:getEntitlement", as: Subscription.self) { subscription = value }
        } catch {}
      }
      .task {
        do {
          for try await value in backend.query("notifications:getPreferences", as: TrialNotificationPreferences.self) { preferences = value }
        } catch { preferences = .init(remindersEnabled: false) }
      }
      .onChange(of: Inputs(subscription: subscription, nudges: preferences?.remindersEnabled, active: phase == .active, user: user)) { before, value in
        if before.user == value.user, before.subscription?.status != nil, before.subscription?.status != "trialing",
          value.subscription?.status == "trialing", let id = value.user {
          let key = "trial-primer-" + id
          if UserDefaults.standard.string(forKey: key) != "asked" { UserDefaults.standard.set("owed", forKey: key) }
        }
        refresh(value)
      }
      .onChange(of: home) { _, _ in presentIfPossible() }
      .alert(copy("notifications.trialPrimerTitle"), isPresented: $primer) {
        Button(copy("notifications.trialPrimerAllow")) {
          let session = backend.sessionGeneration
          Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            if backend.status == .signedIn && backend.sessionGeneration == session {
              refresh(.init(subscription: subscription, nudges: preferences?.remindersEnabled, active: true, user: user))
            }
          }
        }
        Button(copy("common.notNow"), role: .cancel) {}
      } message: { Text(copy("notifications.trialPrimerBody")) }
  }

  private func refresh(_ inputs: Inputs) {
    guard inputs.active, let sub = inputs.subscription, inputs.user != nil else { return }
    guard sub.status == "trialing", let end = sub.expiresAt else {
      mayAsk = false
      primer = false
      LocalTrialNotifications.shared.replace([], copy: copy)
      return
    }
    guard let nudges = inputs.nudges else { return }
    let notices = TrialNotification.schedule(expiration: Date(timeIntervalSince1970: end / 1000), now: .now, nudges: nudges)
    mayAsk = notices.contains { $0.kind == .ending }
    LocalTrialNotifications.shared.replace(notices, copy: copy)
    presentIfPossible()
  }

  private func presentIfPossible() {
    guard home, mayAsk, phase == .active, let user, !primer else { return }
    let key = "trial-primer-" + user
    guard UserDefaults.standard.string(forKey: key) == "owed" else { return }
    Task {
      let session = backend.sessionGeneration
      let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
      guard session == backend.sessionGeneration, backend.status == .signedIn, self.user == user,
        home, phase == .active, mayAsk, !primer, UserDefaults.standard.string(forKey: key) == "owed" else { return }
      UserDefaults.standard.set("asked", forKey: key)
      if status == .notDetermined { primer = true }
    }
  }
}

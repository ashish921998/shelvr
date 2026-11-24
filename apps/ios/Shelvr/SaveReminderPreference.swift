import ShelvrKit
import SwiftUI
import UserNotifications

struct SaveReminderPreference: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var preferences: TrialNotificationPreferences?
  @State private var busy = false
  @State private var message = ""
  @State private var attempt = 0

  var body: some View {
    VStack(alignment: .leading) {
      if let preferences {
        Toggle(copy("notifications.toggleLabel"), isOn: Binding(get: { preferences.weeklyShelfEnabled }, set: { value in
          Task { await set(value, weekly: true) }
        })).disabled(busy)
        Toggle(copy("notifications.remindersToggle"), isOn: Binding(get: { preferences.remindersEnabled }, set: { value in
          Task { await set(value, weekly: false) }
        })).disabled(busy)
      } else if !message.isEmpty {
        Button(copy("common.retry")) { attempt += 1 }
      }
      if !message.isEmpty { Text(message).font(.footnote).foregroundStyle(.secondary) }
    }
    .task(id: attempt) {
      message = ""
      do {
        for try await value in backend.query("notifications:getPreferences", as: TrialNotificationPreferences.self) { preferences = value }
      } catch { if !Task.isCancelled { message = copy("errors.retrySoon") } }
    }
  }

  private func set(_ enabled: Bool, weekly: Bool) async {
    guard !busy else { return }
    let session = backend.sessionGeneration
    busy = true
    defer { busy = false }
    message = ""
    do {
      if enabled {
        let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        guard allowed else { message = copy(weekly ? "notifications.disabledBody" : "notifications.remindersDisabledBody"); return }
      }
      guard backend.status == .signedIn, session == backend.sessionGeneration else { return }
      if weekly {
        try await backend.client.mutation("notifications:setPreferences", with: ["weeklyShelfEnabled": enabled, "timezone": TimeZone.current.identifier])
      } else {
        try await backend.client.mutation("notifications:setSaveReminders", with: ["enabled": enabled, "timezone": TimeZone.current.identifier])
      }
      for try await saved in backend.query("notifications:getPreferences", as: TrialNotificationPreferences.self) {
        guard backend.status == .signedIn, session == backend.sessionGeneration else { return }
        preferences = saved
        if (weekly ? saved.weeklyShelfEnabled : saved.remindersEnabled) != enabled { message = copy("errors.retrySoon") }
        return
      }
    } catch { message = copy("errors.retrySoon") }
  }
}

import Foundation

public enum WelcomeHandoff {
  public enum Purpose: String, Sendable { case existing, afterQuestions }
  public static let finishedKey = "swift.finishedWelcome"

  public static func progressKey(_ account: String?) -> String {
    account.map { "swift.onboarding." + $0 } ?? "swift.welcome.progress"
  }

  private static let pendingKey = "swift.welcome.signIn"

  static func stage(_ purpose: Purpose?, subject: String?, defaults: UserDefaults) {
    guard let purpose, let subject else { defaults.removeObject(forKey: pendingKey); return }
    defaults.set(["purpose": purpose.rawValue, "subject": subject], forKey: pendingKey)
  }

  static func consume(subject: String, account: String, defaults: UserDefaults) {
    guard let record = defaults.dictionary(forKey: pendingKey) as? [String: String] else { return }
    defer { defaults.removeObject(forKey: pendingKey) }
    guard record["subject"] == subject, let raw = record["purpose"], let purpose = Purpose(rawValue: raw) else { return }
    apply(purpose, to: account, defaults: defaults)
  }

  static func apply(_ purpose: Purpose, to account: String, defaults: UserDefaults) {
    let completed = "swift.onboarded." + account
    let draft = progressKey(nil)
    switch purpose {
    case .existing:
      defaults.set(true, forKey: completed)
      defaults.set(true, forKey: finishedKey)
      defaults.removeObject(forKey: progressKey(account))
    case .afterQuestions:
      if !defaults.bool(forKey: completed), let data = defaults.data(forKey: draft) {
        defaults.set(data, forKey: progressKey(account))
      }
    }
    defaults.removeObject(forKey: draft)
  }
}

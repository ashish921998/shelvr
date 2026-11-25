import Foundation

public enum WelcomeHandoff {
  public enum Purpose { case existing, afterQuestions }
  public static let finishedKey = "swift.finishedWelcome"

  public static func progressKey(_ account: String?) -> String {
    account.map { "swift.onboarding." + $0 } ?? "swift.welcome.progress"
  }

  public static func apply(_ purpose: Purpose, to account: String, defaults: UserDefaults) {
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

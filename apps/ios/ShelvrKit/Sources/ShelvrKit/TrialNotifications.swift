import Foundation

public struct TrialNotification: Equatable, Sendable {
  public enum Kind: String, CaseIterable, Sendable {
    case ending = "shelvr.trial-ending"
    case lastDay = "shelvr.trial-last-day"
    case dayOne = "shelvr.trial-day-1"
    case dayThree = "shelvr.trial-day-3"
  }
  public let kind: Kind
  public let date: Date

  public static func shouldArmPrimer(
    previousAccount: String?, previousStatus: String?, account: String, status: String?
  ) -> Bool {
    status == "trialing" && (previousAccount != account || previousStatus != "trialing")
  }

  public static func schedule(expiration: Date, now: Date, nudges: Bool, calendar: Calendar = .current) -> [Self] {
    var notices = [Self]()
    if let warning = TrialDates.reminder(before: expiration, now: now, calendar: calendar) {
      notices.append(.init(kind: .ending, date: warning))
    }
    let previousDay = calendar.date(byAdding: .day, value: -1, to: expiration)
    var last = expiration.addingTimeInterval(-25 * 3600)
    let hour = calendar.component(.hour, from: last)
    if let previousDay, calendar.isDate(last, inSameDayAs: previousDay),
      !(hour < 10 && calendar.component(.hour, from: expiration) < 11) {
      if hour >= 19 { last = calendar.date(bySettingHour: 19, minute: 0, second: 0, of: last) ?? last }
      if last.timeIntervalSince(now) > 60 { notices.append(.init(kind: .lastDay, date: last)) }
    }
    guard !notices.isEmpty, nudges else { return notices }
    let start = expiration.addingTimeInterval(-7 * 86_400)
    for (day, kind): (Int, Kind) in [(1, .dayOne), (3, .dayThree)] {
      guard var at = calendar.date(byAdding: .day, value: day, to: start) else { continue }
      let h = calendar.component(.hour, from: at)
      if h < 10 || h >= 19 { at = calendar.date(bySettingHour: min(19, max(10, h)), minute: 0, second: 0, of: at) ?? at }
      if at.timeIntervalSince(now) > 60 { notices.append(.init(kind: kind, date: at)) }
    }
    return notices
  }
}

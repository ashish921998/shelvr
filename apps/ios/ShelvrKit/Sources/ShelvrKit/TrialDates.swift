import Foundation

public struct TrialDates: Equatable, Sendable {
  public let start: Date
  public let end: Date
  public let reminder: Date?

  public init?(start: Date, unit: Calendar.Component, count: Int, calendar: Calendar = .current) {
    guard count > 0 else { return nil }
    self.start = start
    switch unit {
    case .day, .weekOfYear:
      end = start.addingTimeInterval(Double(count) * (unit == .day ? 1 : 7) * 86_400)
    case .month, .year:
      guard let date = calendar.date(byAdding: unit, value: count, to: start) else { return nil }
      end = date
    default: return nil
    }
    reminder = Self.reminder(before: end, now: start, calendar: calendar)
  }

  public static func reminder(before expiration: Date, now: Date, calendar: Calendar = .current) -> Date? {
    var fire = expiration.addingTimeInterval(-2 * 86_400)
    let hour = calendar.component(.hour, from: fire)
    if hour < 9 || hour >= 20 {
      guard let evening = calendar.date(bySettingHour: 20, minute: 0, second: 0, of: fire),
        let adjusted = calendar.date(byAdding: .day, value: hour < 9 ? -1 : 0, to: evening)
      else { return nil }
      fire = adjusted
    }
    return fire.timeIntervalSince(now) > 60 ? fire : nil
  }
}

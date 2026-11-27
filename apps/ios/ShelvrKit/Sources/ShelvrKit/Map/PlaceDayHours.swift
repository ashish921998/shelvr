import Foundation

public struct PlaceDayHours: Decodable, Hashable, Sendable {
  public enum Display: Equatable, Sendable {
    case closed, allDay, ranges(String)
  }

  struct Reported: Decodable {
    let value: PlaceDayHours?

    init(from decoder: Decoder) {
      value = try? PlaceDayHours(from: decoder)
    }
  }

  private struct Range: Decodable, Hashable, Sendable {
    let opensMinute, closesMinute: Int

    var valid: Bool {
      (0..<1_440).contains(opensMinute) && closesMinute > opensMinute && closesMinute <= opensMinute + 1_440
    }
  }

  private let localDate: String
  private let timeZone: String
  private let intervals: [Range]

  public func display(on now: Date, locale: Locale) -> Display? {
    guard let zone = TimeZone(identifier: timeZone) else { return nil }
    let dateFormat = Date.ISO8601FormatStyle(timeZone: zone).year().month().day()
    guard localDate == now.formatted(dateFormat), intervals.allSatisfy(\.valid) else { return nil }
    if intervals.isEmpty { return .closed }
    if intervals.count == 1, intervals[0].opensMinute == 0, intervals[0].closesMinute == 1_440 { return .allDay }
    let style = Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, timeZone: .gmt)
    func time(_ minute: Int) -> String {
      Date(timeIntervalSinceReferenceDate: TimeInterval(minute % 1_440) * 60).formatted(style)
    }
    let text = intervals.sorted { $0.opensMinute < $1.opensMinute }.map {
      time($0.opensMinute) + "–" + time($0.closesMinute)
    }.joined(separator: " · ")
    return .ranges(text)
  }
}

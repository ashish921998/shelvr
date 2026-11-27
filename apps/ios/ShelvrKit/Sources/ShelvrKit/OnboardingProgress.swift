import Foundation

public struct OnboardingProgress: Codable, Sendable {
  public enum Step: String, CaseIterable, Codable, Sendable {
    case opener, savedCount, goal, been, chart, city, cityEcho, ahaShare, firstSave, ahaSpots, carousel, notifications
  }

  public static let flowVersion = 27
  public static let stepIDs: [Step: String] = [
    .opener: "opener", .savedCount: "saved_count", .goal: "goal", .been: "been_cities", .chart: "progress_chart",
    .city: "city", .cityEcho: "city_echo", .ahaShare: "aha_share", .firstSave: "first_save", .ahaSpots: "aha_spots",
    .carousel: "carousel", .notifications: "notification_ask"]

  public var awaitingAccountAccess: Bool?
  public var viewed: Set<Step>?
  public var completed: Set<Step>?
  public var step: Step = .opener
  public var savedCount: String?
  public var goals: Set<String> = []
  public var visitedCities: Set<String> = []
  public var city: String?
  public var skippedShare = false
  public var demoOperationID = "link:" + UUID().uuidString

  public init() {}

  public mutating func advance(skipping: Bool = false) {
    if skipping {
      switch step {
      case .goal: goals = ["date", "travel", "food"]
      case .been: visitedCities = []
      case .city: city = nil
      default: break
      }
    }
    if step == .ahaShare {
      skippedShare = skipping
      step = skipping ? .ahaSpots : .firstSave
    } else if let index = Step.allCases.firstIndex(of: step), index + 1 < Step.allCases.count {
      step = Step.allCases[index + 1]
    }
  }

  public mutating func back() {
    if step == .ahaSpots, skippedShare { step = .ahaShare }
    else if let index = Step.allCases.firstIndex(of: step), index > 0 { step = Step.allCases[index - 1] }
  }

  public var completedProperties: [String: Any] {
    let goalOrder = ["date", "travel", "food"].filter(goals.contains)
    let spaces = goalOrder.map { ["date": "Date nights", "travel": "Travel", "food": "Restaurants to try"][$0] ?? "" }
    return [
      "save_pileup": [String](), "interests": spaces.filter { $0 == "Travel" }, "travel_vibes": spaces.filter { $0 == "Date nights" },
      "sample_city": city.map { $0 as Any } ?? NSNull(), "goal": goalOrder.first.map { $0 as Any } ?? NSNull(), "goals": goalOrder,
      "saved_count": savedCount.map { $0.prefix(1).lowercased() + String($0.dropFirst()) as Any } ?? NSNull(),
      "been_count": visitedCities.count, "space_count": spaces.count, "space_names": spaces, "custom_space_count": 0,
      "$set": ["save_pileup": [String]()]]
  }
}

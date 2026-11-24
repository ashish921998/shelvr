import Foundation

public struct OnboardingProgress: Codable, Sendable {
  public enum Step: String, CaseIterable, Codable, Sendable {
    case opener, savedCount, goal, been, chart, city, cityEcho, ahaShare, firstSave, ahaSpots, carousel, notifications
  }

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
}

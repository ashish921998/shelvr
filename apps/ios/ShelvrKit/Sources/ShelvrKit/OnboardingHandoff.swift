import Foundation

public struct OnboardingHandoff: Codable, Sendable {
  public var cities: [String]
  public var url: URL?
  public let operation: String
  public let space: String?

  public init(cities: [String], url: URL?, operation: String, space: String?) {
    self.cities = cities
    self.url = url
    self.operation = operation
    self.space = space
  }

  public static func canSave(pro: Bool, freeOpen: Bool, remaining: Int) -> Bool {
    pro || (freeOpen && remaining > 0)
  }

  public func remaining(afterStamps: Bool) -> Self? {
    var next = self
    if afterStamps { next.cities = [] } else { next.url = nil }
    return next.cities.isEmpty && next.url == nil ? nil : next
  }
}

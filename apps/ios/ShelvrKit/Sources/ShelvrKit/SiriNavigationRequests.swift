import Foundation
import Observation

@MainActor @Observable public final class SiriNavigationRequests {
  public private(set) var pending: UUID?

  public init() {}

  public func requestLibrary() { pending = UUID() }

  public func consume(_ request: UUID) -> AppLink? {
    guard pending == request else { return nil }
    pending = nil
    return AppLink("/home")
  }
}

public struct SiriFolderAccess: Equatable {
  public let entitled: Bool
  public let active: Bool

  public init(entitled: Bool, active: Bool) {
    self.entitled = entitled
    self.active = active
  }
}

public struct SiriFolderSuggestions {
  private var previous: [String: String]?

  public init() {}

  public mutating func changed(to names: [String: String]) -> Bool {
    guard names != previous else { return false }
    previous = names
    return true
  }
}

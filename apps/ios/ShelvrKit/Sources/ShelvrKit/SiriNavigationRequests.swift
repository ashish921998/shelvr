import Foundation
import Observation

@MainActor @Observable public final class SiriNavigationRequests {
  public private(set) var pending: UUID?
  private var save: (id: String, owner: String, session: UUID)?

  public init() {}

  public func requestLibrary() {
    save = nil
    pending = UUID()
  }

  public func requestSave(id: String, owner: String, session: UUID) {
    guard id.wholeMatch(of: /[A-Za-z0-9_-]+/) != nil else { return }
    save = (id, owner, session)
    pending = UUID()
  }

  public func consume(_ request: UUID, owner: String? = nil, session: UUID? = nil) -> AppLink? {
    guard pending == request else { return nil }
    pending = nil
    defer { save = nil }
    if let save {
      guard save.owner == owner, save.session == session else { return nil }
      return AppLink("/item/" + save.id)
    }
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

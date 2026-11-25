import Foundation
import Observation

@MainActor @Observable public final class SiriNavigationRequests {
  public private(set) var pending: UUID?
  public var pendingLibrary: UUID? { personal == nil ? pending : nil }
  public var pendingPersonal: UUID? { personal == nil ? nil : pending }
  private var personal: (link: AppLink, owner: String, session: UUID)?

  public init() {}

  public func requestLibrary() {
    personal = nil
    pending = UUID()
  }

  public func requestSave(id: String, owner: String, session: UUID) {
    guard id.wholeMatch(of: /[A-Za-z0-9_-]+/) != nil, let link = AppLink("/item/" + id) else { return }
    personal = (link, owner, session)
    pending = UUID()
  }

  public func requestVisualSearch(labels: [String], owner: String, session: UUID) {
    let term = labels.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }.prefix(3).joined(separator: " ")
    var route = URLComponents()
    route.path = "/home"
    if !term.isEmpty { route.queryItems = [URLQueryItem(name: "query", value: term)] }
    guard let encoded = route.string, let link = AppLink(encoded) else { return }
    personal = (link, owner, session)
    pending = UUID()
  }

  public func consume(_ request: UUID, owner: String? = nil, session: UUID? = nil) -> AppLink? {
    guard pending == request else { return nil }
    pending = nil
    defer { personal = nil }
    if let personal {
      guard personal.owner == owner, personal.session == session else { return nil }
      return personal.link
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

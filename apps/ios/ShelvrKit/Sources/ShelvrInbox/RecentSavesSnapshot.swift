import Foundation

public struct RecentSavesSnapshot: Codable, Sendable {
  public struct Item: Codable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let kind: String
    public init(id: String, title: String, kind: String) {
      self.id = id
      self.title = title
      self.kind = kind
    }
  }

  public let owner: String
  public let items: [Item]
  public let expires: Date?

  public init(owner: String, items: [Item], expires: Date?) {
    self.owner = owner
    self.items = items
    self.expires = expires
  }

  public func visible(to owner: String?, at date: Date) -> Bool {
    self.owner == owner && (expires.map { date < $0 } ?? true)
  }

  public static var location: URL? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ShelvrAppGroup") as? String,
      let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return root.appending(path: "SwiftRecentSaves.json")
  }
}

import Foundation

public struct RecentSavesSnapshot: Codable, Sendable {
  public struct Item: Codable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let kind: String
    public let subtitle: String?
    public let thumbnail: Data?
    public init(id: String, title: String, kind: String, subtitle: String? = nil, thumbnail: Data? = nil) {
      self.id = id
      self.title = title
      self.kind = kind
      self.subtitle = subtitle
      self.thumbnail = thumbnail
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

  public static func destination(scheme: String, snapshot: Self?) -> URL? {
    URL(string: "\(scheme):///\(snapshot?.items.isEmpty == true ? "add" : "")")
  }

  public func displayed(small: Bool) -> ArraySlice<Item> { items.prefix(small ? 4 : 5) }

  public static func canKeep(_ file: URL, owner: String?, now: Date = Date()) -> Bool {
    guard let data = try? Data(contentsOf: file),
      let snapshot = try? JSONDecoder().decode(Self.self, from: data) else { return false }
    return snapshot.visible(to: owner, at: now)
  }

  public static func clear(_ file: URL, cache: URL = .cachesDirectory) throws {
    let manager = FileManager.default
    if manager.fileExists(atPath: file.path) { try manager.removeItem(at: file) }
    if manager.fileExists(atPath: cache.path) {
      for candidate in try manager.contentsOfDirectory(at: cache, includingPropertiesForKeys: nil)
      where candidate.lastPathComponent.hasPrefix("widget-download-") {
        try manager.removeItem(at: candidate)
      }
    }
    let previous = file.deletingLastPathComponent().appending(path: "ExpoWidgets")
    if manager.fileExists(atPath: previous.path) {
      for candidate in try manager.contentsOfDirectory(at: previous, includingPropertiesForKeys: nil)
      where candidate.lastPathComponent.hasPrefix("recent-saves-") && candidate.pathExtension == "jpg" {
        try manager.removeItem(at: candidate)
      }
    }
  }

  public static var location: URL? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ShelvrAppGroup") as? String,
      let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return root.appending(path: "SwiftRecentSaves.json")
  }
}

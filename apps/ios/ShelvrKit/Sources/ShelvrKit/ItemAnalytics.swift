import Foundation

public enum ItemAnalytics {
  public static func source(_ value: String?) -> String {
    ["home", "space", "search", "digest", "map"].first { $0 == value } ?? "direct"
  }

  public static func properties(_ save: LibrarySave, now: Date = .now) -> [String: Any]? {
    guard save.fixtureKey == nil else { return nil }
    let age = max(0, (now.timeIntervalSince1970 * 1000).rounded() - save._creationTime)
    return ["item_id": save._id, "item_type": save.type ?? "link", "saved_at": save._creationTime, "item_age_ms": age]
  }
}

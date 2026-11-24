import Foundation

public struct PushNotificationOpen: Sendable {
  public let link: AppLink
  public let properties: [String: String]

  public init?(userInfo: [AnyHashable: Any]) {
    let body = userInfo["body"] as? [AnyHashable: Any]
    let payload = body?["url"] is String ? (body ?? userInfo) : userInfo
    guard let url = payload["url"] as? String, let link = AppLink(url) else { return nil }

    let kinds: Set<String> = ["weekly_shelf", "trip_eve", "plan_vote", "read_reminder", "cook_reminder", "visit_reminder"]
    let kind = payload["kind"] as? String ?? ""
    let id = payload["notificationId"] as? String ?? ""
    self.link = link
    properties = [
      "notification_kind": kinds.contains(kind) ? kind : "unknown",
      "notification_id": id.wholeMatch(of: /[A-Za-z0-9_-]{1,80}/) == nil ? "" : id
    ]
  }
}

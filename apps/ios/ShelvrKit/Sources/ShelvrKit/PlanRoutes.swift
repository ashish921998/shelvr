import Foundation

public enum PlanRoutes {
  public static func needsLoadedPlan(_ link: AppLink) -> Bool {
    switch link.path.first {
    case "settings", "profile", "paywall": false
    default: true
    }
  }

  public static func allowedWithoutPersonalAccess(_ link: AppLink) -> Bool {
    switch link.path.first {
    case "add-trip-stop", "shared-trip-links", "profile", "settings", "list-invite", "passport-invite",
      "shared-lists", "shared-list", "collections", "trip-plan":
      true
    case "date-plan", "go-out", "new-trip", "add-list-place":
      link.query.contains { $0.name == "listId" && $0.value?.isEmpty == false }
    default: false
    }
  }
}

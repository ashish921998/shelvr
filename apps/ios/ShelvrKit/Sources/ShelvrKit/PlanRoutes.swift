import Foundation

public enum PlanRoutes {
  public static func listID(_ link: AppLink) -> String? {
    guard let value = link.query.first(where: { $0.name == "listId" })?.value, !value.isEmpty else { return nil }
    return value
  }

  public static func needsLoadedPlan(_ link: AppLink) -> Bool {
    !allowedWithoutPersonalAccess(link)
  }

  public static func allowedWithoutPersonalAccess(_ link: AppLink) -> Bool {
    switch link.path.first {
    case "add-trip-stop", "shared-trip-links", "profile", "settings", "paywall", "list-invite", "passport-invite",
      "shared-lists", "shared-list", "collections", "trip-plan":
      true
    case "date-plan", "go-out", "new-trip", "add-list-place":
      listID(link) != nil
    default: false
    }
  }
}

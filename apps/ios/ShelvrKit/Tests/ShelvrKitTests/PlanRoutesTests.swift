import Testing
@testable import ShelvrKit

@Test func lapsedMembersCanReachOnlySharedPlanningAndAccountRoutes() throws {
  for path in ["/saves", "/item/a", "/date-plan?city=Lisbon", "/new-trip?listId=", "/date-plan?listId&listId=a", "/add"] {
    #expect(!PlanRoutes.allowedWithoutPersonalAccess(try #require(AppLink(path))))
  }
  for path in ["/settings", "/list-invite/t", "/shared-trip-links", "/collections",
    "/date-plan?listId=a&city=Lisbon", "/add-trip-stop?tripId=a&day=1"] {
    #expect(PlanRoutes.allowedWithoutPersonalAccess(try #require(AppLink(path))))
  }
}

@Test func planReadsGatePersonalRoutesWhileSharedAccessRemainsAvailable() throws {
  for path in ["/settings", "/profile", "/paywall", "/collections", "/shared-list/a",
    "/list-invite/t", "/passport-invite/t", "/shared-trip-links", "/date-plan?listId=a",
    "/trip-plan/a", "/add-trip-stop?tripId=a"] {
    #expect(!PlanRoutes.needsLoadedPlan(try #require(AppLink(path))))
  }
  for path in ["/saves", "/item/a", "/new-trip", "/date-plan?listId&listId=a", "/add-list-place?listId="] {
    #expect(PlanRoutes.needsLoadedPlan(try #require(AppLink(path))))
  }
}

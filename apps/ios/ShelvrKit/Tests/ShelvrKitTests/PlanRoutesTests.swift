import Testing
@testable import ShelvrKit

@Test func onlyPersonalPlanningAndPlaceEditingNeedProOnEntry() throws {
  for path in ["/date-plan", "/date-plan?city=Lisbon", "/new-trip", "/new-trip?mode=generate", "/edit-save-places?itemId=a"] {
    #expect(PlanRoutes.proPlacement(try #require(AppLink(path))) != nil)
  }
  for path in ["/go-out?city=Lisbon", "/date-plan?listId=a&city=Lisbon", "/new-trip?listId=a", "/trip-plan/a", "/item/a"] {
    #expect(PlanRoutes.proPlacement(try #require(AppLink(path))) == nil)
  }
}

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

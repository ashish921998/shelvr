import Testing
@testable import ShelvrKit

@Test func lapsedMembersCanReachOnlySharedPlanningAndAccountRoutes() throws {
  for path in ["/saves", "/item/a", "/date-plan?city=Lisbon", "/new-trip?listId=", "/add"] {
    #expect(!PlanRoutes.allowedWithoutPersonalAccess(try #require(AppLink(path))))
  }
  for path in ["/settings", "/list-invite/t", "/shared-trip-links", "/collections",
    "/date-plan?listId=a&city=Lisbon", "/add-trip-stop?tripId=a&day=1"] {
    #expect(PlanRoutes.allowedWithoutPersonalAccess(try #require(AppLink(path))))
  }
}

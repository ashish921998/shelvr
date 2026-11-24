import Combine
import ConvexMobile
import Foundation

public struct TripsPage: Decodable {
  public struct Trip: Decodable, Identifiable {
    public let _id, city: String
    public let name, cover, startDate: String?
    public let dayCount, stopCount: Int
    public var id: String { _id }
  }
  public let page: [Trip]
  public let continueCursor: String
  public let isDone: Bool

  public func newTrips(after seen: Set<String>) -> [Trip] {
    var ids = seen
    return page.filter { ids.insert($0.id).inserted }
  }
}

extension Backend {
  public func tripsPage(after cursor: String?) -> some AsyncSequence<TripsPage, any Error> {
    let options: [String: ConvexEncodable?] = ["numItems": 20.0, "cursor": cursor]
    return client.subscribe(to: "tripPlannerData:listTripPlans", with: ["paginationOpts": options], yielding: TripsPage.self).values
  }

  public func deleteTrip(_ id: String) async throws {
    try await client.mutation("tripPlannerData:deleteTripPlan", with: ["tripId": id])
  }
}

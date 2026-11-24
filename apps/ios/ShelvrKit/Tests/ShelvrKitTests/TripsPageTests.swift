import Foundation
import Testing
@testable import ShelvrKit

@Test func pagedTripsKeepTheFirstAppearanceAcrossUpdates() throws {
  let json = """
    {"isDone":false,"continueCursor":"c","page":[
    {"_id":"a","city":"A","dayCount":2,"stopCount":1},
    {"_id":"b","city":"B","dayCount":4,"stopCount":8},
    {"_id":"b","city":"B","dayCount":4,"stopCount":8}]}
    """
  let page = try JSONDecoder().decode(TripsPage.self, from: Data(json.utf8))
  #expect(page.newTrips(after: ["a"]).map(\.id) == ["b"])
}

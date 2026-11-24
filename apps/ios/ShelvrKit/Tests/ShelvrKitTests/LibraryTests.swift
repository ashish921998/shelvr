import Foundation
import Testing
@testable import ShelvrKit

@Test func readsPagedSavesInDayAndReadingOrder() throws {
  let data = Data("""
    {"page":[
      {"_id":"a","_creationTime":3000,"status":"ready","cities":["City"]},
      {"_id":"b","_creationTime":2000,"status":"processing"},
      {"_id":"c","_creationTime":1000,"status":"ready"},
      {"_id":"d","_creationTime":0,"status":"failed"}
    ],"continueCursor":"next","isDone":false}
    """.utf8)
  let page = try JSONDecoder().decode(LibraryPage.self, from: data)
  #expect(!page.isDone)
  #expect(page.continueCursor == "next")
  #expect(page.page.filter(\.needsReview).map(\.id) == ["c", "d"])
  #expect(LibrarySave.days(page.page).first?.1.map(\.id) == ["b", "a", "c", "d"])
}

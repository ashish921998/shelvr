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

@Test func retryMatchesTheServerAndRespectsFreshProcessingRuns() throws {
  func save(_ fields: String) throws -> LibrarySave {
    try JSONDecoder().decode(LibrarySave.self, from: Data("{\"_id\":\"a\",\"_creationTime\":1,\(fields)}".utf8))
  }
  let now = Date(timeIntervalSince1970: 1000)
  #expect(try save(#""status":"failed","failureReason":"not_found""#).canRetry(at: now) == false)
  #expect(try save(#""status":"failed","failureReason":"image_too_large""#).canRetry(at: now) == false)
  #expect(try save(#""status":"failed","failureReason":"error""#).canRetry(at: now))
  #expect(try save(#""status":"processing","processingStartedAt":990000"#).canRetry(at: now) == false)
  #expect(try save(#""status":"processing""#).canRetry(at: now))
  #expect(try save(#""status":"ready","enrichment":"partial""#).canRetry(at: now))
}

@Test func editingPlacesRoundTripsEveryServerFieldAndOmitsAbsentValues() throws {
  let json = #"{"version":"v1","ready":true,"places":[{"name":"Place","appleId":"id","lat":1,"lng":2,"category":"Cafe"}]}"#
  let snapshot = try JSONDecoder().decode(SavePlaces.self, from: Data(json.utf8))
  let place = try #require(snapshot.places.first)
  #expect(snapshot.version == "v1")
  let encoded = try place.convexEncode()
  let value = try #require(JSONSerialization.jsonObject(with: Data(encoded.utf8)) as? [String: Any])
  #expect(value["city"] == nil)
  #expect(value["appleId"] as? String == "id")
  #expect(value["category"] as? String == "Cafe")
  #expect(value["lat"] as? Double == 1)
}

@Test func placeSearchKeepsTheAreaForDisplayOnly() throws {
  let json = #"{"available":true,"places":[{"name":"Cafe","area":"Downtown","lat":1,"lng":2}]}"#
  let result = try JSONDecoder().decode(PlaceMatches.self, from: Data(json.utf8))
  let match = try #require(result.places.first)
  #expect(match.area == "Downtown")
  let fields = try #require(JSONSerialization.jsonObject(with: Data(try match.place.convexEncode().utf8)) as? [String: Any])
  #expect(fields["area"] == nil)
}

@Test func retryMatchesTheGeneratedExpoAndServerAnswers() throws {
  struct Vectors: Decodable { let now: Double; let saves: [LibrarySave]; let expected: [Bool] }
  let url = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../TestData/library-retry.json")
  let rows = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
  let now = Date(timeIntervalSince1970: rows.now / 1000)
  #expect(rows.saves.map { $0.canRetry(at: now) } == rows.expected)
}

@Test func searchKeepsOnlyResultsAndFailuresForTheDisplayedQuery() throws {
  let row = try JSONDecoder().decode(LibrarySave.self, from: Data(#"{"_id":"a","_creationTime":0,"status":"ready"}"#.utf8))
  let cached = LibrarySearchState.items("coffee", [row])
  guard case let .items(found) = cached.display(for: "coffee") else { Issue.record("Lost cached results"); return }
  #expect(found.map(\.id) == ["a"])
  guard case .loading = cached.display(for: "museum") else { Issue.record("Stale results"); return }
  guard case .loading = LibrarySearchState.failure("museum").display(for: "coffee") else { Issue.record("Stale failure"); return }
  guard case .failure = LibrarySearchState.failure("coffee").display(for: "coffee") else { Issue.record("Lost error"); return }
}

@Test func cityPhotosPreferTheSaveThenTheCuratedPhotoAndDeduplicateTheServerFallback() throws {
  let own = URL(string: "https://example.com/save.jpg")!
  let remote = URL(string: "https://example.com/city.jpg")!
  let bundled = URL(fileURLWithPath: "/library-city-austin.jpg")
  func city(_ cover: URL?, _ photo: URL?) -> LibraryCity {
    .init(city: "Austin", count: 1, placeCount: 1, visitedCount: nil, cover: cover?.absoluteString, photo: photo?.absoluteString)
  }
  #expect(city(own, remote).coverCandidates(curated: bundled) == [own, bundled, remote])
  #expect(city(remote, remote).coverCandidates(curated: bundled) == [bundled, remote])
  #expect(city(own, nil).coverCandidates(curated: nil) == [own])
  #expect(LibraryCity.coverName("København") == "copenhagen")
  #expect(LibraryCity.coverName("New York City") == "new-york")
}

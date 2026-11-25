import Foundation
import Testing
@testable import ShelvrKit

@Test func visualSearchRanksMatchingWordsAcrossTheSameFieldsAsExpo() throws {
  let data = Data(#"{"_id":"item","_creationTime":0,"type":"link","status":"ready","url":"https://www.example.com/place","tags":["Café","  Café  ","Bakeries"],"description":"São Paulo","siteName":"Public example","note":"Chocolate croissant"}"#.utf8)
  let save = try JSONDecoder().decode(SearchableSave.self, from: data)
  let copy = Copy()
  #expect(save.displayTitle(copy: copy) == "example.com")
  #expect(save.keywords == ["Café", "Bakeries"])
  #expect(save.matches("SAO café croissant", copy: copy))
  #expect(!save.matches("coffee unavailable", copy: copy))
  #expect(save.visualScore(labels: ["são", "croissant", "in", "café"], copy: copy) == 3)
  #expect(save.visualScore(labels: ["on", "at"], copy: copy) == 0)
}

@Test func searchableNoteTitlesAndExcerptsAreBounded() throws {
  let note = String(repeating: "a", count: 100) + "\n" + String(repeating: "b", count: 600)
  let data = try JSONSerialization.data(withJSONObject: ["_id": "item", "_creationTime": 0, "type": "note", "status": "ready", "note": note])
  let save = try JSONDecoder().decode(SearchableSave.self, from: data)
  #expect(save.displayTitle(copy: Copy()) == String(repeating: "a", count: 80))
  #expect(save.excerpt?.count == 600)
  #expect(save.exportText(copy: Copy()) == note)
}

@MainActor @Test func openingAResolvedSaveRequiresTheSameAccountAndSessionAtConsumption() throws {
  let navigation = SiriNavigationRequests()
  let session = UUID()
  func request() throws -> UUID {
    navigation.requestSave(id: "save123", owner: "alice", session: session)
    return try #require(navigation.pending)
  }
  let valid = try request()
  #expect(navigation.pendingLibrary == nil && navigation.pendingPersonal == valid)
  #expect(navigation.consume(valid, owner: "alice", session: session)?.path == ["item", "save123"])
  let switched = try request()
  #expect(navigation.consume(switched, owner: "bob", session: session) == nil)
  let replaced = try request()
  #expect(navigation.consume(replaced, owner: "alice", session: UUID()) == nil)
  navigation.requestSave(id: "../settings", owner: "alice", session: session)
  #expect(navigation.pending == nil)
}

@Test func systemSearchKeepsTheNewestThreeHundredReadySavesAcrossPageBoundaries() async throws {
  func row(_ id: Int, _ status: String) throws -> SearchableSave {
    let data = try JSONSerialization.data(withJSONObject: ["_id": String(id), "_creationTime": id, "type": "link", "status": status])
    return try JSONDecoder().decode(SearchableSave.self, from: data)
  }
  let first = try (0..<300).map { try row($0, $0 == 0 ? "processing" : "ready") }
  let second = try [row(300, "ready"), row(301, "ready")]
  let saves = await SearchableSavePage.latestReady { cursor in
    cursor == nil ? SearchableSavePage(page: first, continueCursor: "next", isDone: false) :
      SearchableSavePage(page: second, continueCursor: "", isDone: true)
  }
  #expect(saves?.count == 300)
  #expect(saves?.first?._id == "1" && saves?.last?._id == "300")
  let repeated = await SearchableSavePage.latestReady { _ in SearchableSavePage(page: [], continueCursor: "same", isDone: false) }
  #expect(repeated == nil)
}

@MainActor @Test func visualLabelsOnlySeedTheRequestingSessionsLibrary() throws {
  let navigation = SiriNavigationRequests(), session = UUID()
  let labels = [" ", " coffee ", "A&B", "São Paulo", "unrelated"]
  navigation.requestVisualSearch(labels: labels, owner: "a", session: session)
  let request = try #require(navigation.pendingPersonal)
  #expect(navigation.pendingLibrary == nil)
  let link = try #require(navigation.consume(request, owner: "a", session: session))
  #expect(link.path == ["home"])
  #expect(link.query == [URLQueryItem(name: "query", value: "coffee A&B São Paulo")])
  navigation.requestVisualSearch(labels: labels, owner: "a", session: session)
  let stale = try #require(navigation.pendingPersonal)
  #expect(navigation.consume(stale, owner: "b", session: session) == nil)
  navigation.requestVisualSearch(labels: [" "], owner: "a", session: session)
  let cleared = try #require(navigation.pendingPersonal)
  #expect(navigation.consume(cleared, owner: "a", session: session)?.query == [URLQueryItem(name: "query", value: "")])
}

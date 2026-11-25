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
}

@MainActor @Test func openingAResolvedSaveRequiresTheSameAccountAndSessionAtConsumption() throws {
  let navigation = SiriNavigationRequests()
  let session = UUID()
  func request() throws -> UUID {
    navigation.requestSave(id: "save123", owner: "alice", session: session)
    return try #require(navigation.pending)
  }
  let valid = try request()
  #expect(navigation.consume(valid, owner: "alice", session: session)?.path == ["item", "save123"])
  let switched = try request()
  #expect(navigation.consume(switched, owner: "bob", session: session) == nil)
  let replaced = try request()
  #expect(navigation.consume(replaced, owner: "alice", session: UUID()) == nil)
  navigation.requestSave(id: "../settings", owner: "alice", session: session)
  #expect(navigation.pending == nil)
}

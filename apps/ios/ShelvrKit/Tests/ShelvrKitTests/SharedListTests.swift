import Foundation
import Testing
@testable import ShelvrKit

@Test func aMembersWentFlagBelongsOnlyToThatMember() throws {
  let json = """
    {"_id":"list","name":"Lisbon","inviteToken":"abc","isOwner":false,"covered":true,
    "cities":["Lisbon"],"members":[],"places":[
    {"_id":"a","name":"A","city":"Lisbon","isNew":false,"addedByYou":false,"wentBy":[{"isYou":false}]},
    {"_id":"b","name":"B","city":"Lisbon","isNew":false,"addedByYou":true,"wentBy":[{"isYou":true}]},
    {"_id":"c","name":"C","city":"Lisbon","visitedAt":1,"isNew":false,"addedByYou":false}]}
    """
  let row = try JSONDecoder().decode(SharedListDetail.self, from: Data(json.utf8))
  #expect(row.inviteURL(preview: true).absoluteString == "shelvr-preview://list-invite/abc")
  #expect(row.places.map(\.went) == [false, true, false])
  #expect(AppLink(row.inviteURL(preview: false).absoluteString)?.path == ["list-invite", "abc"])
}

import Foundation
import Testing
@testable import ShelvrKit

@Test func aMembersWentFlagBelongsOnlyToThatMember() throws {
  let json = """
    {"_id":"list","name":"Lisbon","inviteToken":"abc","isOwner":false,"covered":true,
    "cities":["Lisbon"],"members":[],"places":[
    {"_id":"a","name":"A","city":"Lisbon","addedByYou":false,"wentBy":[{"isYou":false}]},
    {"_id":"b","name":"B","city":"Lisbon","addedByYou":true,"wentBy":[{"isYou":true}]},
    {"_id":"c","name":"C","city":"Lisbon","addedByYou":false}]}
    """
  let row = try JSONDecoder().decode(SharedListDetail.self, from: Data(json.utf8))
  #expect(row.places.map(\.went) == [false, true, false])
  #expect(AppLink(row.inviteURL.absoluteString)?.path == ["list-invite", "abc"])
}

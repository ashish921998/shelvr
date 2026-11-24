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

@Test func remoteSearchRecognizesANearbyNamesakeWithOneAppleID() throws {
  let json = """
    {"_id":"one","name":"Santa Joana","city":"Lisboa","addedByYou":true,"isNew":false,
    "itemId":"save","lat":38.721,"lng":-9.14}
    """
  let place = try JSONDecoder().decode(SharedListDetail.Place.self, from: Data(json.utf8))
  #expect(place.matches(name: "Locke de Santa Joana", lat: 38.72, lng: -9.14, apple: "A-1", item: nil))
  #expect(!place.matches(name: "Santa Joana", lat: 38.8, lng: -9.14, apple: "A-1", item: nil))
}

@Test func listPlansCarryTheListAndChosenCityIntoBothPlanners() {
  for trip in [false, true] {
    let link = SharedListDetail.planLink(trip: trip, city: "Rio + São Paulo", list: "list")
    #expect(link?.path == [trip ? "new-trip" : "go-out"])
    #expect(link?.query.first { $0.name == "city" }?.value == "Rio + São Paulo")
    #expect(link?.query.first { $0.name == "listId" }?.value == "list")
  }
}

@Test func sharedListPickerUsesServerPlaceIdentity() throws {
  struct Vector: Decodable {
    struct Candidate: Decodable {
      let name: String
      let lat, lng: Double
      let appleId, itemId: String?
    }
    let existing: SharedListDetail.Place
    let candidate: Candidate
    let matches: Bool
  }
  let url = URL(filePath: #filePath).deletingLastPathComponent().appending(path: "../../../TestData/shared-list-place-identity.json")
  let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
  for vector in vectors {
    let candidate = vector.candidate
    #expect(vector.existing.matches(name: candidate.name, lat: candidate.lat, lng: candidate.lng,
      apple: candidate.appleId, item: candidate.itemId) == vector.matches)
  }
}

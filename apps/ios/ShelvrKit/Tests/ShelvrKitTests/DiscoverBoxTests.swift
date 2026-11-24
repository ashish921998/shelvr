import Foundation
import Testing
@testable import ShelvrKit

@Test func discoverBoxesMatchExpo() throws {
  struct Vector: Decodable {
    let latitude, longitude, latitudeDelta, longitudeDelta, width, height, tilt: Double
    let box: DiscoverBox
  }
  let file = try #require(Bundle.module.url(forResource: "discover-boxes", withExtension: "json"))
  for row in try JSONDecoder().decode([Vector].self, from: Data(contentsOf: file)) {
    #expect(DiscoverBox.visible(latitude: row.latitude, longitude: row.longitude,
      latitudeDelta: row.latitudeDelta, longitudeDelta: row.longitudeDelta,
      width: row.width, height: row.height, tilted: row.tilt > 0) == row.box)
  }
}

@Test func nearbyReachMatchesExpo() {
  let box = DiscoverBox(west: -9.3, south: 38.65, east: -9, north: 38.8)
  #expect(box.includingNearby(latitude: 38.72, longitude: -9.14)
    == DiscoverBox(west: -10.5, south: 38, east: -8, north: 39.25))
}

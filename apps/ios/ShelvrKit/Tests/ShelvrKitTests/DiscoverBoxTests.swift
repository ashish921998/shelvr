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

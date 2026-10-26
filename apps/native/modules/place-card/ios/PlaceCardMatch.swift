import Foundation

enum PlaceCardMatch {
  struct Candidate {
    let name: String
    let lat: Double
    let lng: Double
  }

  static func words(_ value: String) -> [String] {
    value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
  }

  static func name(_ value: String) -> String {
    value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
  }

  static func accepts(expected: String, actual: String, city: String = "", lat: Double, lng: Double, foundLat: Double, foundLng: Double) -> Bool {
    guard [lat, lng, foundLat, foundLng].allSatisfy({ $0.isFinite }),
      abs(lat) <= 90, abs(foundLat) <= 90, abs(lng) <= 180, abs(foundLng) <= 180 else { return false }
    // Multi-city saves retain a city qualifier; Google returns the venue's own display name.
    let parts = expected.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
    let venue = parts.count > 1 && !name(city).isEmpty && name(parts.last ?? "") == name(city)
      ? parts.dropLast().joined(separator: ",") : expected
    let wanted = name(venue)
    let found = name(actual)
    guard !wanted.isEmpty, !found.isEmpty else { return false }
    guard wanted == found || (wanted.count >= 5 && words(actual).starts(with: words(venue))) else { return false }
    let radians = Double.pi / 180
    let deltaLat = (foundLat - lat) * radians
    let deltaLng = (foundLng - lng) * radians
    let a = pow(sin(deltaLat / 2), 2) + cos(lat * radians) * cos(foundLat * radians) * pow(sin(deltaLng / 2), 2)
    let distance = 6_371_000 * 2 * asin(sqrt(min(1, max(0, a))))
    return distance.isFinite && distance <= 250
  }

  static func uniqueIndex(expected: String, city: String = "", lat: Double, lng: Double, candidates: [Candidate]) -> Int? {
    let matches = candidates.indices.filter { index in
      let candidate = candidates[index]
      return accepts(expected: expected, actual: candidate.name, city: city, lat: lat, lng: lng,
                     foundLat: candidate.lat, foundLng: candidate.lng)
    }
    return matches.count == 1 ? matches.first : nil
  }
}

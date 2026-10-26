import Foundation

enum PlaceCardMatch {
  static func name(_ value: String) -> String {
    value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
      .unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined()
  }

  static func accepts(expected: String, actual: String, lat: Double, lng: Double, foundLat: Double, foundLng: Double) -> Bool {
    guard [lat, lng, foundLat, foundLng].allSatisfy({ $0.isFinite }),
      abs(lat) <= 90, abs(foundLat) <= 90, abs(lng) <= 180, abs(foundLng) <= 180 else { return false }
    let wanted = name(expected)
    let found = name(actual)
    guard !wanted.isEmpty, !found.isEmpty else { return false }
    guard wanted == found || (wanted.count >= 5 && found.hasPrefix(wanted)) else { return false }
    let radians = Double.pi / 180
    let deltaLat = (foundLat - lat) * radians
    let deltaLng = (foundLng - lng) * radians
    let a = pow(sin(deltaLat / 2), 2) + cos(lat * radians) * cos(foundLat * radians) * pow(sin(deltaLng / 2), 2)
    let distance = 6_371_000 * 2 * asin(sqrt(min(1, max(0, a))))
    return distance.isFinite && distance <= 250
  }
}

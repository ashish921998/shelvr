import Foundation

public struct DiscoverBox: Codable, Equatable, Sendable {
  public let west, south, east, north: Double
  public static let world = Self(west: -180, south: -85, east: 180, north: 85)

  public static func visible(latitude: Double, longitude: Double, latitudeDelta: Double,
    longitudeDelta: Double, width: Double, height: Double, tilted: Bool) -> Self? {
    guard [latitude, longitude, latitudeDelta, longitudeDelta, width, height].allSatisfy(\.isFinite),
      width > 0, height > 0, longitudeDelta > 0, latitudeDelta > 0,
      abs(latitude) <= 90, abs(longitude) <= 180
    else { return nil }
    let latitudeCosine = cos(latitude * .pi / 180)
    let degreesPerPoint = longitudeDelta / min(width, height * latitudeCosine)
    let spanFactor = tilted ? 1.0 : 0.5
    let horizontal = snapped(longitude, max(width / 2 * degreesPerPoint, longitudeDelta * spanFactor))
    guard horizontal.upperBound - horizontal.lowerBound < 180 else { return .world }
    let lat = clamp(latitude)
    let vertical = snapped(lat, max(height / 2 * degreesPerPoint * cos(lat * .pi / 180), latitudeDelta * spanFactor))
    return Self(west: horizontal.lowerBound, south: clamp(vertical.lowerBound),
      east: horizontal.upperBound, north: clamp(vertical.upperBound))
  }

  private static func snapped(_ centre: Double, _ half: Double) -> ClosedRange<Double> {
    let step = pow(2.0, ceil(log2(max(half, 1.0 / 32) / 2)))
    let cell = floor(centre / step)
    let reach = ceil(half / step)
    return ((cell - reach) * step)...((cell + 1 + reach) * step)
  }

  private static func clamp(_ latitude: Double) -> Double { min(85, max(-85, latitude)) }
}

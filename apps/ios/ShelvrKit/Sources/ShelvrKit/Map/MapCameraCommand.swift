import CoreLocation
import Foundation

@MainActor public final class MapCameraCommand {
  public enum Action {
    case locate(CLLocationCoordinate2D)
    case overview([MapPlace])
    case fitFilteredPlaces
  }

  private var pending: Action?

  public init(action: Action) {
    pending = action
  }

  public func cancel() {
    pending = nil
  }

  public func consume() -> Action? {
    defer { pending = nil }
    return pending
  }
}

public struct MapLocationRequest {
  public struct Fix {
    public let id = UUID()
    public let coordinate: CLLocationCoordinate2D
  }

  public private(set) var isPending = false
  public private(set) var latestFix: Fix?

  public init() {}

  public mutating func begin() {
    isPending = true
  }

  public mutating func resolve(_ coordinate: CLLocationCoordinate2D) {
    guard isPending else { return }
    isPending = false
    latestFix = Fix(coordinate: coordinate)
  }

  public mutating func cancel() {
    isPending = false
    latestFix = nil
  }
}

import CoreLocation
import Foundation

@MainActor public final class MapCameraCommand {
  public enum Action {
    case locate(CLLocationCoordinate2D)
    case overview([MapPlace])
    case fitFilteredPlaces
  }

  private var pending: Action?
  private var refitWhenCatalogArrives: Bool

  public init(action: Action, refitWhenCatalogArrives: Bool = false) {
    pending = action
    self.refitWhenCatalogArrives = refitWhenCatalogArrives
  }

  public func takeCatalogRefit() -> Bool {
    defer { refitWhenCatalogArrives = false }
    return refitWhenCatalogArrives
  }

  public func cancel() {
    pending = nil
    refitWhenCatalogArrives = false
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

  public private(set) var pendingID: UUID?
  public private(set) var latestFix: Fix?

  public init() {}

  public mutating func begin() -> UUID {
    let id = UUID()
    pendingID = id
    return id
  }

  public mutating func resolve(_ coordinate: CLLocationCoordinate2D, for id: UUID) {
    guard pendingID == id else { return }
    pendingID = nil
    latestFix = Fix(coordinate: coordinate)
  }

  public mutating func cancel() {
    pendingID = nil
    latestFix = nil
  }
}

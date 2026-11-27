import Foundation

public enum WentFilter: Equatable, Hashable, Sendable {
  case all, want, went
}

public struct MapFilters: Equatable, Sendable {
  public var went: WentFilter
  public var kinds: Set<PlaceKind>
  public var search: String

  public init(went: WentFilter = .all, kinds: Set<PlaceKind> = [], search: String = "") {
    self.went = went
    self.kinds = kinds
    self.search = search
  }

  public var hasSearch: Bool { !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  var isActive: Bool { went != .all || !kinds.isEmpty || hasSearch }
}

public struct MapScene {
  public let filters: MapFilters
  public let visible: [MapPlace]
  public let chips: [PlaceKind]
  public let visited: Set<String>
  public let opening: [MapPlace]?

  public var showsWentSwitch: Bool { !visited.isEmpty }

  public init(saved: [MapPlace]?, discover: [MapPlace], visits: [MapVisit], filters: MapFilters,
    catalog: [MapPlace] = []) {
    let own = saved ?? []
    let visited = MapVisit.visitedIDs(visits, among: own)
    var effective = filters
    if visited.isEmpty { effective.went = .all }

    let allPlaces = effective.went == .all
    let entries = MapPlace.combined(saved: own, discover: allPlaces ? discover : [])
    let scoped = entries.filter { allPlaces || visited.contains($0.id) == (effective.went == .went) }
    let matching = MapPlace.search(scoped, catalog: allPlaces ? catalog : [], query: effective.search)
    let visible = matching.filter { place in
      effective.kinds.isEmpty || !effective.kinds.isDisjoint(with: place.kinds)
    }

    self.filters = effective
    self.visited = visited
    self.visible = visible
    self.chips = Self.filterKinds(matching, selected: effective.kinds)
    self.opening = saved.flatMap { saved in
      if effective.isActive { return visible.isEmpty ? nil : visible }
      return Self.busiestCity(in: saved.isEmpty ? discover : saved)
    }
  }

  private static func filterKinds(_ entries: [MapPlace], selected: Set<PlaceKind>) -> [PlaceKind] {
    let order: [PlaceKind] = [.food, .coffee, .activities, .drinks, .dessert, .shopping]
    let available = Set(entries.flatMap(\.kinds)).union(selected)
    return order.filter { available.contains($0) }
  }

  private static func busiestCity(in anchors: [MapPlace]) -> [MapPlace]? {
    guard !anchors.isEmpty else { return nil }
    let groups = Dictionary(grouping: anchors) { ($0.city ?? "").lowercased() }
    let city = anchors.compactMap { $0.city?.lowercased() }.filter { !$0.isEmpty }.max {
      groups[$0, default: []].count < groups[$1, default: []].count
    }
    return city.flatMap { groups[$0] } ?? anchors
  }
}

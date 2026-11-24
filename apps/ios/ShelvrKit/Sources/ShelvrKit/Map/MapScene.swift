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

  public init(saved: [MapPlace]?, discover: [MapPlace], visits: [MapVisit], filters: MapFilters) {
    let own = saved ?? []
    let visited = MapVisit.visitedIDs(visits, among: own)
    var effective = filters
    if visited.isEmpty { effective.went = .all }

    let entries = MapPlace.combined(saved: own, discover: effective.went == .all ? discover : [])
    let matches = entries.filter { place in
      (effective.went == .all || visited.contains(place.id) == (effective.went == .went)) &&
        (effective.kinds.isEmpty || !effective.kinds.isDisjoint(with: place.kinds))
    }
    let visible = MapPlace.search(matches, query: effective.search)

    self.filters = effective
    self.visited = visited
    self.visible = visible
    self.chips = Self.filterKinds(entries, selected: effective.kinds)
    self.opening = saved.flatMap { saved in
      if effective.isActive { return visible.isEmpty ? nil : visible }
      return Self.busiestCity(in: saved.isEmpty ? discover : saved)
    }
  }

  private static func filterKinds(_ entries: [MapPlace], selected: Set<PlaceKind>) -> [PlaceKind] {
    var counts: [PlaceKind: Int] = [:]
    for place in entries {
      for kind in Set(place.kinds) { counts[kind, default: 0] += 1 }
    }
    return PlaceKind.allCases
      .filter { $0 != .stay && (counts[$0, default: 0] >= 3 || selected.contains($0)) }
      .sorted { counts[$0, default: 0] > counts[$1, default: 0] }
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

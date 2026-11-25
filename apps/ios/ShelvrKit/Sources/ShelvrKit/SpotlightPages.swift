import Foundation

public struct SpotlightPages {
  public enum Cursor: Hashable, Sendable {
    case start
    case after(String)

    public var value: String? {
      if case let .after(value) = self { return value }
      return nil
    }
  }

  private var pages: [Cursor: SearchableSavePage] = [:]
  public private(set) var cursors: [Cursor] = [.start]
  public private(set) var saves: [SearchableSave] = []

  public init() {}

  @discardableResult
  public mutating func receive(_ page: SearchableSavePage, for cursor: Cursor) -> Bool {
    guard cursors.contains(cursor) else { return false }
    pages[cursor] = page
    rebuild()
    return true
  }

  public mutating func invalidate(_ cursor: Cursor) {
    pages.removeValue(forKey: cursor)
    rebuild()
  }

  private mutating func rebuild() {
    var wanted: [Cursor] = [.start]
    var visited: Set<Cursor> = [.start]
    var rows: [SearchableSave] = []
    var ids = Set<String>()
    while let key = wanted.last, let current = pages[key] {
      for row in current.page where row.status == "ready" && ids.insert(row._id).inserted {
        rows.append(row)
        if rows.count == 300 { break }
      }
      guard rows.count < 300, !current.isDone else { break }
      let next = Cursor.after(current.continueCursor)
      guard visited.insert(next).inserted else { break }
      wanted.append(next)
    }
    pages = pages.filter { visited.contains($0.key) }
    cursors = wanted
    saves = rows
  }
}

public struct SiriBatch: Sendable {
  public private(set) var firstID: String?
  public private(set) var saved = 0
  public private(set) var queued = 0

  public init() {}

  public mutating func accepted(_ id: String) {
    firstID = firstID ?? id
    if id.hasPrefix("queued:") { queued += 1 } else { saved += 1 }
  }

  public func failed(of total: Int) -> Int { total - saved - queued }
}

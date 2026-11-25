public struct AnalyticsIdentity: Sendable {
  private var identified: String?
  private var completed = false

  public init() {}

  public mutating func update(_ account: String?, authenticated: Bool) -> (identify: Bool, complete: Bool) {
    let changed = identified != account
    if changed {
      identified = account
      completed = false
    }
    let complete = account != nil && authenticated && !completed
    if complete { completed = true }
    return (changed && account != nil, complete)
  }
}

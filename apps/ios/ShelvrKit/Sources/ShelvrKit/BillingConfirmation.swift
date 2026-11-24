import Foundation
import Observation

public struct BillingAccount: Equatable, Sendable {
  public let session: UUID
  public let userID: String

  public init(session: UUID, userID: String) {
    self.session = session
    self.userID = userID
  }
}

@MainActor @Observable
public final class BillingConfirmation {
  public enum State { case idle, syncing, failed, confirmed }
  public private(set) var state = State.idle

  public init() {}

  public func sync(for account: BillingAccount, current: () -> BillingAccount?,
    synchronize: () async throws -> Bool, confirmed: () -> Void) async {
    guard current() == account, state == .idle || state == .failed else { return }
    state = .syncing
    do {
      let active = try await synchronize()
      guard current() == account else { state = .idle; return }
      guard active else { state = .failed; return }
      state = .confirmed
      confirmed()
    } catch {
      state = current() == account ? .failed : .idle
    }
  }
}

public struct PaywallEligibility: Equatable, Sendable {
  public enum Status: Sendable { case eligible, ineligible, unknown }
  public let eligible: Set<String>
  public let useAlternate: Bool

  public static func check(products: [String], hasAlternate: Bool,
    lookup: ([String]) async -> [String: Status]) async -> Self {
    let results = await lookup(products)
    let eligible = Set(results.compactMap { $0.value == .eligible ? $0.key : nil })
    return Self(eligible: eligible,
      useAlternate: hasAlternate && eligible.isEmpty && results.values.contains(.ineligible))
  }
}

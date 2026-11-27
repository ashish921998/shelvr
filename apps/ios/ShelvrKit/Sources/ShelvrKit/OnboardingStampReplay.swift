import Foundation

public struct OnboardingCompletion {
  private var finished = false

  public init() {}

  public mutating func commit(for account: String, currentAccount: String?, save: () throws -> Void) rethrows -> String? {
    guard !finished, currentAccount == account else { return nil }
    try save()
    finished = true
    return account
  }
}

public enum OnboardingStampReplay {
  public enum Scope { case active, suspended, ended }

  public struct Claim: Equatable, Sendable {
    public let account: String
    public let picked: Int
    public let stamped: Double
  }

  @MainActor public static func run(
    account: String,
    scope: () -> Scope,
    pending: () -> OnboardingHandoff?,
    claim: ([String]) async throws -> Double,
    store: (OnboardingHandoff?) throws -> Void,
    record: (Claim) -> Void,
    pause: (Int) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }
  ) async {
    var delay = 2
    var receipt: (operation: String, event: Claim)?
    while !Task.isCancelled, scope() != .ended, let entry = pending(), !entry.cities.isEmpty {
      if let receipt, receipt.operation != entry.operation { return }
      if scope() == .active {
        do {
          if receipt == nil {
            let stamped = try await claim(entry.cities)
            receipt = (entry.operation, Claim(account: account, picked: entry.cities.count, stamped: stamped))
          }
          try Task.checkCancellation()
          if scope() == .active, let receipt {
            guard let latest = pending(), latest.operation == receipt.operation else { return }
            try store(latest.remaining(afterStamps: true))
            record(receipt.event)
            return
          }
        } catch {}
      }
      guard !Task.isCancelled, scope() != .ended else { return }
      do { try await pause(delay) }
      catch { return }
      delay = min(60, delay * 2)
    }
  }
}

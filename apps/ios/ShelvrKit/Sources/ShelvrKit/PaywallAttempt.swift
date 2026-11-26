import Foundation

public struct PaywallAttempt: Sendable {
  public enum TrialEligibility: String, Sendable {
    case eligible, ineligible, noIntro = "no_intro", unknown

    public static func folding(_ statuses: [Self?]) -> Self {
      if statuses.isEmpty { return .unknown }
      if statuses.contains(.eligible) { return .eligible }
      if statuses.allSatisfy({ $0 == .noIntro }) { return .noIntro }
      if statuses.contains(.ineligible) { return .ineligible }
      return .unknown
    }
  }

  public enum Outcome: String, Sendable {
    case cancelled = "paywall_cancelled"
    case purchased = "paywall_purchase_completed"
    case restored = "paywall_restored"
  }

  public let placement: String
  public let id: String
  public let requestedAt: Date
  public private(set) var presentedAt: Date?
  private var context: [String: String] = [:]
  private var settled = false

  public init(placement: String, id: UUID = UUID(), now: Date = .now) {
    self.placement = placement
    self.id = id.uuidString.lowercased()
    requestedAt = now
  }

  public var requested: [String: Any] { ["placement": placement, "paywall_attempt_id": id] }

  public mutating func failed(_ reason: String, now: Date = .now) -> [String: Any]? {
    guard presentedAt == nil, !settled else { return nil }
    settled = true
    return requested.merging(["reason": reason, "duration_ms": Self.milliseconds(now.timeIntervalSince(requestedAt))]) { $1 }
  }

  public mutating func present(offeringID: String?, trialEligible: TrialEligibility?, now: Date = .now) -> [String: Any]? {
    guard presentedAt == nil, !settled else { return nil }
    presentedAt = now
    if let offeringID { context["offering_id"] = offeringID }
    if let trialEligible { context["trial_eligible"] = trialEligible.rawValue }
    return requested.merging(context) { $1 }
  }

  public mutating func finish(_ outcome: Outcome, productID: String? = nil, now: Date = .now) -> [(String, [String: Any])] {
    guard let presentedAt, !settled else { return [] }
    settled = true
    let shown = requested.merging(context) { $1 }.merging(["duration_ms": Self.milliseconds(now.timeIntervalSince(presentedAt))]) { $1 }
    var result = shown
    if outcome != .cancelled, let productID { result["product_id"] = productID }
    return [("paywall_shown", shown), (outcome.rawValue, result)]
  }

  static func milliseconds(_ interval: TimeInterval) -> Int { max(0, Int((interval * 1000).rounded())) }
}

@MainActor
public final class PaywallFunnel {
  public enum Source: String, Sendable { case purchase, restore }

  public static let shared = PaywallFunnel()
  private var pending: (source: Source, at: Date)?
  private var active: String?
  private var account: String?
  private var blocked: (placement: String, at: Date, purchased: Bool)?

  public init() {}

  public func recordAccess(_ source: Source, unlessActive: Bool = false, now: Date = .now) -> [String: Any]? {
    if unlessActive && active != nil { return nil }
    blocked?.purchased = true
    if let active { return Self.activation(active, source, 0) }
    pending = (source, now)
    return nil
  }

  public func observe(account: String?, status: String?, now: Date = .now) -> [String: Any]? {
    if let previous = self.account, previous != account { pending = nil; blocked = nil; active = nil }
    self.account = account
    active = status.flatMap { ["trialing", "pro", "lifetime"].contains($0) ? $0 : nil }
    guard let active, let access = pending else { return nil }
    pending = nil
    return Self.activation(active, access.source, now.timeIntervalSince(access.at))
  }

  public func block(_ placement: String, now: Date = .now) {
    blocked = (placement, now, false)
  }

  public func resume(_ placement: String, now: Date = .now) -> [String: Any]? {
    guard let entry = blocked, entry.placement == placement else { return nil }
    blocked = nil
    let delay = now.timeIntervalSince(entry.at)
    guard delay <= 30 * 60 else { return nil }
    return ["placement": placement, "delay_ms": PaywallAttempt.milliseconds(delay), "purchased_since_block": entry.purchased]
  }

  private static func activation(_ status: String, _ source: Source, _ delay: TimeInterval) -> [String: Any] {
    ["status": status, "source": source.rawValue, "delay_ms": PaywallAttempt.milliseconds(delay)]
  }
}

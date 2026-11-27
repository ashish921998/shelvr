import Combine
import ConvexMobile
import Foundation
import ShelvrKit
import SwiftUI

struct ServerPlan: Decodable {
  let status: String
  let expiresAt: Double?
  var entitled: Bool {
    status == "lifetime" || (["pro", "trialing"].contains(status) && (expiresAt ?? 0) > Date.now.timeIntervalSince1970 * 1000)
  }
}

extension OnboardingHandoff {
  static func key(_ account: String) -> String { "swift.onboarding.pending." + account }

  func save(_ account: String) throws {
    UserDefaults.standard.set(try JSONEncoder().encode(self), forKey: Self.key(account))
  }
}

struct OnboardingReplay: ViewModifier {
  let account: String
  @Environment(Backend.self) private var backend
  @Environment(\.scenePhase) private var phase

  func body(content: Content) -> some View {
    content
      .task { await replayStamps() }
      .task(id: phase) { await replayDemo() }
  }

  private func read() -> OnboardingHandoff? {
    UserDefaults.standard.data(forKey: OnboardingHandoff.key(account))
      .flatMap { try? JSONDecoder().decode(OnboardingHandoff.self, from: $0) }
  }

  private func store(_ pending: OnboardingHandoff?) throws {
    if let pending { try pending.save(account) }
    else { UserDefaults.standard.removeObject(forKey: OnboardingHandoff.key(account)) }
  }

  private func replayStamps() async {
    let generation = backend.sessionGeneration
    await OnboardingStampReplay.run(account: account, scope: {
      guard backend.sessionGeneration == generation else { return .ended }
      guard let owner = backend.userID else { return .suspended }
      return owner == account ? .active : .ended
    }, pending: read, claim: { cities in
      try await backend.client.mutation("cityStamps:claimOnboardingCityStamps",
        with: ["cities": cities.map { $0 as (any ConvexEncodable)? }])
    }, store: store, record: { event in
      Analytics.capture("passport_city_stamps_claimed", ["picked": event.picked, "stamped": event.stamped], distinctId: event.account)
    })
  }

  private func replayDemo() async {
    guard phase == .active else { return }
    let generation = backend.sessionGeneration
    var delay = 2
    while !Task.isCancelled, generation == backend.sessionGeneration, backend.userID == account,
      let entry = read(), let url = entry.url {
      do {
        struct FreeSaves: Decodable { let open: Bool; let left: Int }
        let plans = backend.client.subscribe(to: "subscriptions:getEntitlement", yielding: ServerPlan.self)
        let counts = backend.client.subscribe(to: "freeSaves:getFreeSaves", yielding: FreeSaves?.self)
        for try await (plan, freeSaves) in plans.combineLatest(counts).values {
          guard OnboardingHandoff.canSave(pro: plan.entitled, freeOpen: freeSaves?.open == true,
            remaining: freeSaves?.left ?? 0) else { continue }
          try Task.checkCancellation()
          guard generation == backend.sessionGeneration, backend.userID == account else { return }
          var args: [String: (any ConvexEncodable)?] = [
            "url": url.absoluteString, "operationId": entry.operation, "saveSource": "onboarding_demo"]
          if plan.entitled, let name = entry.space {
            let id: String = try await backend.client.mutation("spaces:createSpace", with: ["name": name, "dynamic": true])
            args["spaceId"] = id
          }
          try Task.checkCancellation()
          guard generation == backend.sessionGeneration, backend.userID == account else { return }
          let _: String = try await backend.client.mutation("items:createLinkItem", with: args)
          try Task.checkCancellation()
          guard generation == backend.sessionGeneration, backend.userID == account,
            let latest = read(), latest.operation == entry.operation else { return }
          try store(latest.remaining(afterStamps: false))
          Analytics.capture("onboarding_demo_submitted")
          return
        }
        return
      } catch {
        if Task.isCancelled { return }
        try? await Task.sleep(for: .seconds(delay))
        delay = min(60, delay * 2)
      }
    }
  }
}

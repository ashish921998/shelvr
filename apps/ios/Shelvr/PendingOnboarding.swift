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

struct PendingOnboarding: Codable {
  var cities: [String]
  let url: URL?
  let operation: String
  let space: String?

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
    content.task(id: phase) {
      guard phase == .active else { return }
      let key = PendingOnboarding.key(account)
      let generation = backend.sessionGeneration
      var delay = 2
      while !Task.isCancelled, generation == backend.sessionGeneration,
        let data = UserDefaults.standard.data(forKey: key),
        var entry = try? JSONDecoder().decode(PendingOnboarding.self, from: data)
      {
        do {
          if !entry.cities.isEmpty {
            let _: Double = try await backend.client.mutation("cityStamps:claimOnboardingCityStamps",
              with: ["cities": entry.cities.map { $0 as (any ConvexEncodable)? }])
            try Task.checkCancellation()
            entry.cities = []
            try entry.save(account)
          }
          if let url = entry.url {
            for try await plan in backend.query("subscriptions:getEntitlement", as: ServerPlan.self) where plan.entitled {
              try Task.checkCancellation()
              guard generation == backend.sessionGeneration else { return }
              var args: [String: (any ConvexEncodable)?] = [
                "url": url.absoluteString, "operationId": entry.operation, "saveSource": "onboarding_demo"]
              if let name = entry.space {
                let id: String = try await backend.client.mutation("spaces:createSpace", with: ["name": name, "dynamic": true])
                args["spaceId"] = id
              }
              try Task.checkCancellation()
              guard generation == backend.sessionGeneration else { return }
              let _: String = try await backend.client.mutation("items:createLinkItem", with: args)
              break
            }
            try Task.checkCancellation()
          }
          UserDefaults.standard.removeObject(forKey: key)
          return
        } catch {
          if Task.isCancelled { return }
          try? await Task.sleep(for: .seconds(delay))
          delay = min(60, delay * 2)
        }
      }
    }
  }
}

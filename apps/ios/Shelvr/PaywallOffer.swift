import Foundation
import RevenueCat
import RevenueCatUI
import ShelvrKit

struct PaywallOffer {
  let offering: Offering
  let variables: [String: CustomVariableValue]
  let trialEligible: PaywallAttempt.TrialEligibility?

  static func load(copy: Copy) async throws -> Self? {
    let offerings = try await Purchases.shared.offerings()
    guard let current = offerings.current else { return nil }
    let products = current.availablePackages.map(\.storeProduct)
    let alternate = offerings.all["weekly_annual_draft"].flatMap { $0.identifier == current.identifier ? nil : $0 }
    var trialEligible: PaywallAttempt.TrialEligibility?
    let eligibility = await PaywallEligibility.check(products: products.map(\.productIdentifier), hasAlternate: alternate != nil) { ids in
      let results = await Purchases.shared.checkTrialOrIntroDiscountEligibility(productIdentifiers: ids)
      trialEligible = .folding(ids.map { id in
        results[id].map { result -> PaywallAttempt.TrialEligibility in
          switch result.status {
          case .eligible: .eligible
          case .ineligible: .ineligible
          case .noIntroOfferExists: .noIntro
          default: .unknown
          }
        }
      })
      return results.mapValues { result in
        switch result.status {
        case .eligible: .eligible
        case .ineligible: .ineligible
        default: .unknown
        }
      }
    }
    if eligibility.useAlternate, let alternate { return Self(offering: alternate, variables: [:], trialEligible: trialEligible) }

    let locale = Locale(identifier: copy.locale)
    var variables: [String: CustomVariableValue] = [:]
    let trials = products.compactMap(\.introductoryDiscount).filter { $0.price == 0 }.map(\.subscriptionPeriod)
    if let first = trials.first, trials.allSatisfy({ $0.unit == first.unit && $0.value == first.value }),
      let dates = TrialDates(start: Date(), unit: component(first.unit), count: first.value)
    {
      let label = Date.FormatStyle().month(.abbreviated).day().locale(locale)
      let reminder = dates.reminder ?? dates.end.addingTimeInterval(-2 * 86_400)
      for (name, date) in [("trial_today", dates.start), ("trial_day5", reminder), ("trial_day7", dates.end)] {
        variables[name] = .string(" · " + date.formatted(label))
      }
      variables["trial_remind_date"] = .string(reminder.formatted(label))
      for (name, date) in [("trial_remind_day", reminder), ("trial_end_day", dates.end)] {
        variables[name] = .string(String(Int((date.timeIntervalSince(dates.start) / 86_400).rounded())))
      }
    }
    if let annual = products.first(where: {
      eligibility.eligible.contains($0.productIdentifier) && $0.subscriptionPeriod?.unit == .year && $0.subscriptionPeriod?.value == 1 && $0.introductoryDiscount?.price == 0
    }), let currency = annual.currencyCode {
      let zero = Decimal.zero.formatted(.currency(code: currency).locale(locale))
      variables["trial_offer"] = .string(copy("paywall.trialOffer", ["zero": zero, "price": annual.localizedPriceString]))
    }
    return Self(offering: current, variables: variables, trialEligible: trialEligible)
  }

  private static func component(_ unit: SubscriptionPeriod.Unit) -> Calendar.Component {
    switch unit {
    case .day: .day
    case .week: .weekOfYear
    case .month: .month
    case .year: .year
    @unknown default: .calendar
    }
  }
}

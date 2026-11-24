import Foundation
import RevenueCat
import RevenueCatUI
import ShelvrKit

struct PaywallOffer {
  let offering: Offering
  let variables: [String: CustomVariableValue]

  static func load(copy: Copy) async throws -> Self? {
    let offerings = try await Purchases.shared.offerings()
    guard let current = offerings.current else { return nil }
    let products = current.availablePackages.map(\.storeProduct)
    var eligibleIDs = Set<String>()
    if let other = offerings.all["weekly_annual_draft"], other.identifier != current.identifier {
      let results = await Purchases.shared.checkTrialOrIntroDiscountEligibility(
        productIdentifiers: products.map(\.productIdentifier))
      eligibleIDs = Set(results.compactMap { $0.value.status == .eligible ? $0.key : nil })
      if eligibleIDs.isEmpty, results.values.contains(where: { $0.status == .ineligible }) {
        return Self(offering: other, variables: [:])
      }
    }

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
      eligibleIDs.contains($0.productIdentifier) && $0.subscriptionPeriod?.unit == .year && $0.subscriptionPeriod?.value == 1 && $0.introductoryDiscount?.price == 0
    }), let currency = annual.currencyCode {
      let zero = Decimal.zero.formatted(.currency(code: currency).locale(locale))
      variables["trial_offer"] = .string(copy("paywall.trialOffer", ["zero": zero, "price": annual.localizedPriceString]))
    }
    return Self(offering: current, variables: variables)
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

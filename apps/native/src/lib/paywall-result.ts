export type PaywallOutcome = "success" | "cancelled" | "unavailable";

export type RevenueCatPaywallResult =
  | "NOT_PRESENTED"
  | "ERROR"
  | "CANCELLED"
  | "PURCHASED"
  | "RESTORED"
  | string;

export function mapPaywallResult(
  result: RevenueCatPaywallResult | null | undefined,
): PaywallOutcome {
  if (result === "PURCHASED" || result === "RESTORED") return "success";
  if (result === "CANCELLED") return "cancelled";
  return "unavailable";
}

/**
 * RevenueCat reports a restore as completed even when it found nothing, so a
 * restore only counts once the customer actually holds an entitlement.
 */
export function restoreFoundAccess(
  customerInfo: { entitlements: { active: object } } | null | undefined,
): boolean {
  return (
    !!customerInfo && Object.keys(customerInfo.entitlements.active).length > 0
  );
}

export function shouldOpenPaywallFallback(outcome: PaywallOutcome): boolean {
  return outcome === "unavailable";
}

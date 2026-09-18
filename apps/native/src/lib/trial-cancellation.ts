/**
 * Pure classification of RevenueCat CustomerInfo into "is the user's trial
 * cancelled but still inside its window". Extracted from `entitlement.ts` in
 * the `paywall-result` tradition: the native plumbing there stays thin, the
 * decision is unit-testable without a native runtime.
 *
 * The Convex `subscriptions` row cannot see this state (CANCELLATION
 * preserves the row's status; only EXPIRATION ends it), but CustomerInfo can:
 * an active entitlement in a TRIAL period with `willRenew === false` is
 * exactly "auto-renew off, trial not yet expired".
 */

/** The next-visit cancel survey shows only on `cancelled`. */
export type TrialCancellationState = "cancelled" | "none" | "unknown";

type TrialEntitlement = { periodType: string; willRenew: boolean };

/** A foreground check must fetch after invalidation: even stale CustomerInfo
 * may be returned from the SDK cache while it refreshes in the background. */
export async function readFreshTrialCancellation(purchases: {
  invalidateCustomerInfoCache: () => Promise<void>;
  getCustomerInfo: () => Promise<{
    entitlements: { active: Record<string, TrialEntitlement> };
  }>;
}): Promise<TrialCancellationState> {
  try {
    await purchases.invalidateCustomerInfoCache();
    const info = await purchases.getCustomerInfo();
    return classifyTrialCancellation(Object.values(info.entitlements.active));
  } catch {
    return "unknown";
  }
}

/**
 * - `cancelled` — show the next-visit cancel survey.
 * - `none` — definitely not a cancelled-in-window trial (renewing, paid,
 *   lapsed, or no active entitlement). Suppress the survey.
 * - `unknown` — the answer could not be trusted (SDK not linked, identity
 *   sync not ready, fetch failure). Never show the survey on `unknown`; the
 *   check simply runs again on the next launch.
 */
export function classifyTrialCancellation(
  activeEntitlements: TrialEntitlement[],
): TrialCancellationState {
  // Any non-renewing trial means cancelled-in-window. Today the app has a
  // single entitlement so there is exactly one trial at most, but if RC
  // ever reports several active trials, a cancelled one must not be masked
  // by a renewing one (order-independent by construction).
  const cancelledTrial = activeEntitlements.some(
    (entitlement) =>
      entitlement.periodType === "TRIAL" && !entitlement.willRenew,
  );
  return cancelledTrial ? "cancelled" : "none";
}

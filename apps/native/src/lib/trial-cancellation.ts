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
export type TrialCancellationState =
  | 'cancelled'
  | 'none'
  | 'unknown';

/**
 * - `cancelled` — show the next-visit cancel survey.
 * - `none` — definitely not a cancelled-in-window trial (renewing, paid,
 *   lapsed, or no active entitlement). Suppress the survey.
 * - `unknown` — the answer could not be trusted (SDK not linked, identity
 *   sync not ready, fetch failure). Never show the survey on `unknown`; the
 *   check simply runs again on the next launch.
 */
export function classifyTrialCancellation(
  activeEntitlements: { periodType: string; willRenew: boolean }[],
): TrialCancellationState {
  const trial = activeEntitlements.find(
    (entitlement) => entitlement.periodType === 'TRIAL',
  );
  if (!trial) return 'none';
  return trial.willRenew ? 'none' : 'cancelled';
}

/**
 * Maps RevenueCat paywall presentation outcomes into the three user-visible
 * results Shelvr needs:
 *
 * - `success` — purchase or restore completed; callers refresh entitlement
 * - `cancelled` — the user dismissed without buying; return to the previous screen
 * - `unavailable` — SDK missing, identity sync timed out, not presented, or error;
 *   callers may show a retryable fallback
 *
 * The previous boolean contract collapsed cancellation into the same path as a
 * configuration failure, which made a normal cancel look like a RevenueCat outage.
 */

export type PaywallOutcome = 'success' | 'cancelled' | 'unavailable';

/** The PAYWALL_RESULT string values returned by react-native-purchases-ui. */
export type RevenueCatPaywallResult =
  | 'NOT_PRESENTED'
  | 'ERROR'
  | 'CANCELLED'
  | 'PURCHASED'
  | 'RESTORED'
  | string;

/**
 * Classifies a RevenueCat paywall result. Unknown strings are treated as
 * unavailable so a future SDK value cannot be mistaken for a successful purchase.
 */
export function mapPaywallResult(result: RevenueCatPaywallResult | null | undefined): PaywallOutcome {
  if (result === 'PURCHASED' || result === 'RESTORED') return 'success';
  if (result === 'CANCELLED') return 'cancelled';
  return 'unavailable';
}

/**
 * Whether the paywall fallback route should open. Only real failures do —
 * cancellation must return the user to the previous screen without routing.
 */
export function shouldOpenPaywallFallback(outcome: PaywallOutcome): boolean {
  return outcome === 'unavailable';
}

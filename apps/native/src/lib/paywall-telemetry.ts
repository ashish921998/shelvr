import { analytics } from './analytics';
import type { RevenueCatPaywallResult } from './paywall-result';

export async function observePaywallPresentation(
  properties: { placement: string; paywall_attempt_id: string },
  present: () => Promise<RevenueCatPaywallResult>,
): Promise<RevenueCatPaywallResult> {
  const startedAt = Date.now();
  const outcome = () => ({
    ...properties,
    duration_ms: Math.max(0, Date.now() - startedAt),
  });
  // The imperative API has no on-show callback. An unresolved promise must
  // leave an attempt in analytics without claiming a confirmed impression.
  analytics.capture('paywall_presentation_started', properties);
  try {
    const result = await present();
    if (
      result === 'CANCELLED' ||
      result === 'PURCHASED' ||
      result === 'RESTORED'
    ) {
      analytics.capture('paywall_shown', outcome());
      analytics.capture(
        result === 'CANCELLED'
          ? 'paywall_cancelled'
          : result === 'PURCHASED'
            ? 'paywall_purchase_completed'
            : 'paywall_restored',
        outcome(),
      );
    } else {
      analytics.capture('paywall_failed', {
        ...outcome(),
        reason: result === 'NOT_PRESENTED' ? 'not_presented' : 'sdk_error',
      });
    }
    return result;
  } catch (error) {
    analytics.capture('paywall_failed', {
      ...outcome(),
      reason: 'presentation_exception',
    });
    throw error;
  }
}

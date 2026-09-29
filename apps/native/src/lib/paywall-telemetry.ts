import { analytics } from "./analytics";
import type { PaywallAttemptProperties } from "./analytics";
import type { RevenueCatPaywallResult } from "./paywall-result";

export async function observePaywallPresentation(
  properties: PaywallAttemptProperties,
  present: () => Promise<RevenueCatPaywallResult>,
  /** Extra properties for a purchase/restore outcome, resolved before that
   * outcome is captured. Reads the store product behind the entitlement right
   * after the sheet resolves, when RevenueCat's customer info is fresh. A
   * rejection resolves to nothing — the outcome event still fires. */
  purchaseContext?: () => Promise<{ product_id?: string }>,
): Promise<RevenueCatPaywallResult> {
  const startedAt = Date.now();
  const outcome = () => ({
    ...properties,
    duration_ms: Math.max(0, Date.now() - startedAt),
  });
  // The imperative API has no on-show callback. An unresolved promise must
  // leave an attempt in analytics without claiming a confirmed impression.
  analytics.capture("paywall_presentation_started", properties);
  try {
    const result = await present();
    if (
      result === "CANCELLED" ||
      result === "PURCHASED" ||
      result === "RESTORED"
    ) {
      analytics.capture("paywall_shown", outcome());
      const extra =
        (result === "PURCHASED" || result === "RESTORED") &&
        purchaseContext !== undefined
          ? await purchaseContext().catch(() => ({}))
          : {};
      analytics.capture(
        result === "CANCELLED"
          ? "paywall_cancelled"
          : result === "PURCHASED"
            ? "paywall_purchase_completed"
            : "paywall_restored",
        { ...outcome(), ...extra },
      );
    } else {
      analytics.capture("paywall_failed", {
        ...outcome(),
        reason: result === "NOT_PRESENTED" ? "not_presented" : "sdk_error",
      });
    }
    return result;
  } catch (error) {
    analytics.capture("paywall_failed", {
      ...outcome(),
      reason: "presentation_exception",
    });
    throw error;
  }
}

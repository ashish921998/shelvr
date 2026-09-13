import { analytics, type CancelSurveyReason } from "@/lib/analytics";
import { isAnalyticsAvailable } from "@/lib/posthog";

export type { CancelSurveyReason };

/**
 * Next-visit cancel survey — client boundary.
 *
 * Shown once per account on the Home root when RevenueCat reports the user's
 * trial is cancelled but still inside its window (`willRenew === false`,
 * period `TRIAL` — see lib/trial-cancellation.ts). It deliberately fires on
 * the next Home visit after a cancellation rather than at the cancel moment,
 * because nothing in-app can intercept Apple's cancel sheet.
 *
 * Once-per-account is enforced server-side (convex/cancelSurvey.ts): the row
 * is the durable record across devices and reinstalls, and useCancelSurvey
 * fails closed — no card when the ask cannot be verified as unspent. There is
 * deliberately no local persistence here.
 *
 * Privacy rules, mirroring lib/feedback.ts:
 * - Events carry bounded reason ids only — never free text, URLs, or content.
 * - A submitted reason is stated intent, not proof of cancellation. Only the
 *   server-side webhook events (`trial_cancelled`, …) count as cancellations.
 */

export const CANCEL_SURVEY_REASONS: readonly CancelSurveyReason[] = [
  "too_expensive",
  "not_useful_enough",
  "missing_feature",
  "other",
];

/** id → display label. Lives beside the ids (not in the card) so the
 * analytics vocabulary survives copy changes — docs/analytics/payment-funnel.md
 * points here. */
export const CANCEL_REASON_LABELS: Record<CancelSurveyReason, string> = {
  too_expensive: "Too expensive",
  not_useful_enough: "Not useful enough",
  missing_feature: "Missing a feature",
  other: "Something else",
};

export function isCancelSurveyReason(
  value: string,
): value is CancelSurveyReason {
  return (CANCEL_SURVEY_REASONS as readonly string[]).includes(value);
}

// --- analytics boundary -----------------------------------------------------

export const cancelSurveyAnalytics = {
  isAvailable(): boolean {
    return isAnalyticsAvailable();
  },

  /** Fires when the card actually renders, not when cancellation is detected. */
  shown(): void {
    analytics.capture("cancel_survey_shown");
  },

  dismissed(): void {
    analytics.capture("cancel_survey_dismissed");
  },

  submitted(reason: CancelSurveyReason): void {
    analytics.capture("cancel_survey_submitted", {
      reason,
      survey_source: "next_visit_card",
    });
  },
};

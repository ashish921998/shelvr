import { analytics } from "@/lib/analytics";
import {
  CANCEL_SURVEY_REASONS,
  type CancelSurveyReason,
} from "@convex/model/cancelSurveyFields";

export { CANCEL_SURVEY_REASONS };
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
 * no local persistence of the ask. A pending bounded response is stored
 * separately until its idempotent server mutation completes.
 *
 * Privacy rules, mirroring lib/feedback.ts:
 * - Events carry bounded reason ids only — never free text, URLs, or content.
 * - A submitted reason is stated intent, not proof of cancellation. Only the
 *   server-side webhook events (`trial_cancelled`, …) count as cancellations.
 *
 * The reason ids themselves live in convex/model/cancelSurveyFields.ts, next to
 * the validator the `respond` mutation enforces; they are re-exported here so
 * the card and its analytics keep importing one client-side boundary.
 */

// --- analytics boundary -----------------------------------------------------

export const cancelSurveyAnalytics = {
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

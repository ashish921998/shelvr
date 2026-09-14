import { v } from "convex/values";

/**
 * Cancel-survey validators shared by `schema.ts` (the document shape) and
 * `cancelSurvey.ts` (the `respond:` args), so the two spots cannot drift.
 * The bounded reason ids keep the row free of free text. This module has no
 * server-runtime imports, so the native app loads it as
 * `@convex/model/cancelSurveyFields`: `CancelSurveyReason` (src/lib/analytics.ts),
 * `CANCEL_SURVEY_REASONS` (src/lib/cancel-survey.ts) and the
 * `CancelSurveyResponse` union (src/lib/use-cancel-survey.ts) all derive from
 * the tuple below rather than restating the ids.
 */

// How the ask ended. First recorded outcome wins server-side; a submitted
// outcome carries a reason, a dismissal stands alone.
export const cancelSurveyOutcomeValidator = v.union(
  v.literal("submitted"),
  v.literal("dismissed"),
);

// Why the trial was cancelled, from the next-visit survey card. Absent for
// a dismissal without a stated reason. The order is the card's display order,
// and each id is an analytics contract (PostHog dashboards group on it), so
// adding a reason is additive — never rename or reorder an existing one.
export const CANCEL_SURVEY_REASONS = [
  "too_expensive",
  "not_useful_enough",
  "missing_feature",
  "other",
] as const;

export type CancelSurveyReason = (typeof CANCEL_SURVEY_REASONS)[number];

export const cancelSurveyReasonValidator = v.union(
  ...CANCEL_SURVEY_REASONS.map((reason) => v.literal(reason)),
);

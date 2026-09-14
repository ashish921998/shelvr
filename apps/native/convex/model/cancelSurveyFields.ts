import { v } from "convex/values";

/**
 * Cancel-survey validators shared by `schema.ts` (the document shape) and
 * `cancelSurvey.ts` (the `respond:` args), so the two spots cannot drift.
 * The bounded reason ids keep the row free of free text; the client mirrors
 * are `CancelSurveyReason` in apps/native/src/lib/analytics.ts and the
 * `CancelSurveyResponse` union in use-cancel-survey.ts.
 */

// How the ask ended. First recorded outcome wins server-side; a submitted
// outcome carries a reason, a dismissal stands alone.
export const cancelSurveyOutcomeValidator = v.union(
  v.literal("submitted"),
  v.literal("dismissed"),
);

// Why the trial was cancelled, from the next-visit survey card. Absent for
// a dismissal without a stated reason.
export const cancelSurveyReasonValidator = v.union(
  v.literal("too_expensive"),
  v.literal("not_useful_enough"),
  v.literal("missing_feature"),
  v.literal("other"),
);

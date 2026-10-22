import { v } from "convex/values";

export const cancelSurveyOutcomeValidator = v.union(
  v.literal("submitted"),
  v.literal("dismissed"),
);

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

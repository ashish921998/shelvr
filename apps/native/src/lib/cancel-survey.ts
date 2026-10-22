import { analytics } from "@/lib/analytics";
import {
  CANCEL_SURVEY_REASONS,
  type CancelSurveyReason,
} from "@convex/model/cancelSurveyFields";

export { CANCEL_SURVEY_REASONS };
export type { CancelSurveyReason };

export const cancelSurveyAnalytics = {
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

import * as SecureStore from "expo-secure-store";
import {
  CANCEL_SURVEY_REASONS,
  type CancelSurveyReason,
} from "@convex/model/cancelSurveyFields";

export type CancelSurveyResponse =
  | { outcome: "submitted"; reason: CancelSurveyReason }
  | { outcome: "dismissed" };

export function getPendingCancelSurvey(
  userId: string,
): CancelSurveyResponse | null {
  const raw = SecureStore.getItem(`shelvr.cancel-survey.${userId}`);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("outcome" in value))
      return null;
    if (value.outcome === "dismissed") return { outcome: "dismissed" };
    if (value.outcome !== "submitted" || !("reason" in value)) return null;
    const reason = CANCEL_SURVEY_REASONS.find(
      (reason) => reason === value.reason,
    );
    return reason ? { outcome: "submitted", reason } : null;
  } catch {
    return null;
  }
}

export function setPendingCancelSurvey(
  userId: string,
  response: CancelSurveyResponse | null,
) {
  SecureStore.setItem(
    `shelvr.cancel-survey.${userId}`,
    response ? JSON.stringify(response) : "",
  );
}

import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { cancelSurveyAnalytics } from "@/lib/cancel-survey";
import {
  getPendingCancelSurvey,
  setPendingCancelSurvey,
  type CancelSurveyResponse,
} from "@/lib/pending-cancel-survey";

/** The server owns ask-once semantics; local storage only retains an answer
 * until its idempotent mutation finishes, including across app restarts. */
export function useCancelSurveyResponse(
  userId: string | undefined,
  appState: string,
) {
  const respond = useMutation(api.cancelSurvey.respond);
  const inFlight = useRef(false);
  const submitted = useRef(false);
  const deliver = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = getPendingCancelSurvey(userId);
      if (!response) return;
      const result = await respond(response);
      setPendingCancelSurvey(userId, null);
      if (!result.accepted) return;
      if (response.outcome === "submitted")
        cancelSurveyAnalytics.submitted(response.reason);
      else cancelSurveyAnalytics.dismissed();
    } catch (error) {
      analytics.captureError("cancel_survey_response_failed", error);
    } finally {
      inFlight.current = false;
    }
  }, [userId, respond]);

  useEffect(() => {
    if (appState === "active") void deliver();
  }, [appState, deliver]);

  return useCallback(
    (response: CancelSurveyResponse): boolean => {
      if (!userId || submitted.current) return false;
      try {
        setPendingCancelSurvey(userId, response);
      } catch (error) {
        analytics.captureError("cancel_survey_response_failed", error);
        return false;
      }
      submitted.current = true;
      void deliver();
      return true;
    },
    [userId, deliver],
  );
}

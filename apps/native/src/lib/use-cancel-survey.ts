import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useSegments } from "expo-router";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/current-user";
import { analytics } from "@/lib/analytics";
import { isAnalyticsAvailable } from "@/lib/posthog";
import { isHomeRootRoute } from "@/lib/feedback";
import { isPaywallPending, readRcTrialCancellation } from "@/lib/entitlement";
import { cancelSurveyAnalytics } from "@/lib/cancel-survey";
import type { CancelSurveyResponse } from "./pending-cancel-survey";
import { useCancelSurveyResponse } from "./use-cancel-survey-response";

const PAYWALL_RECHECK_MS = 2000;

export function useCancelSurvey(): {
  visible: boolean;
  presented: () => void;
  finish: (response: CancelSurveyResponse) => void;
} {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const [appState, setAppState] = useState(AppState.currentState);

  const markShown = useMutation(api.cancelSurvey.markShown);
  const submitResponse = useCancelSurveyResponse(userId, appState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const { data: surveyStatus } = useQuery(
    convexQuery(api.cancelSurvey.getStatus, userId ? {} : "skip"),
  );

  const [visible, setVisible] = useState(false);
  const episodeChecked = useRef(false);

  useEffect(() => {
    if (appState !== "active") episodeChecked.current = false;
  }, [appState]);

  useEffect(() => {
    if (!home || appState !== "active" || !userId) return;
    if (episodeChecked.current) return;
    if (surveyStatus === undefined) return;
    if (!isAnalyticsAvailable()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const state = await readRcTrialCancellation();
      if (cancelled) return;
      if (isPaywallPending()) {
        timer = setTimeout(() => void attempt(), PAYWALL_RECHECK_MS);
        return;
      }
      episodeChecked.current = true;
      if (state === "cancelled" && !surveyStatus.asked) {
        setVisible(true);
      } else if (state === "none") {
        setVisible(false);
      }
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [home, appState, userId, surveyStatus]);

  const askPresented = useRef(false);
  const presented = useCallback(() => {
    if (!userId || askPresented.current) return;
    askPresented.current = true;
    void markShown({})
      .then((result) => {
        if (result.accepted) {
          cancelSurveyAnalytics.shown();
        } else {
          setVisible(false);
        }
      })
      .catch((error: unknown) => {
        analytics.captureError("cancel_survey_claim_failed", error);
        askPresented.current = false;
        setVisible(false);
      });
  }, [userId, markShown]);

  const finish = useCallback(
    (response: CancelSurveyResponse) => {
      if (submitResponse(response)) setVisible(false);
    },
    [submitResponse],
  );

  return { visible, presented, finish };
}

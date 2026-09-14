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
import {
  cancelSurveyAnalytics,
  type CancelSurveyReason,
} from "@/lib/cancel-survey";

/** Poll interval while a paywall sheet has the moment (feedback-invitation
 * uses the same cadence). */
const PAYWALL_RECHECK_MS = 2000;

/**
 * The response `finish` records. A submitted outcome carries its bounded
 * reason; a dismissal stands alone — the correlation is structural, so
 * submitting without a reason is unrepresentable, and the object matches
 * the respond mutation's args shape as-is.
 */
type CancelSurveyResponse =
  | { outcome: "submitted"; reason: CancelSurveyReason }
  | { outcome: "dismissed" };

/**
 * Drives the next-visit cancel survey card.
 *
 * Detection runs once per foreground episode while the user is on the Home
 * root. Dismissing the in-app Customer Center sheet does not itself start
 * a foreground episode; cancellation is checked on the next real episode.
 * A transient `unknown` (identity sync not ready, fetch failure) simply
 * retries on the next episode instead of burning the launch.
 *
 * The ask is durably one-per-account (convex/cancelSurvey.ts). The server
 * row is the authority across devices and reinstalls; the hook fails closed
 * and never asks while the row's state is unknown (still loading) or asked.
 * The markShown verdict arbitrates alone: an accepted verdict emits `shown`
 * and keeps the card up; a rejected one (another device consumed the ask
 * first) takes it down without emitting anything — only the call that
 * consumed the ask may count a `shown`.
 *
 * Failures never strand the ask: a failed markShown or respond logs via
 * captureError, takes the card down for the rest of the episode, and leaves
 * the row unwritten — so the next foreground episode re-detects the unspent
 * ask and re-asks.
 *
 * The ask is consumed only when the card actually renders (`presented`),
 * never at detection time — closing the app on Home's loading screen leaves
 * the ask unspent for the next visit. While the card is up, a later check
 * that finds renewal resumed (UNCANCELLATION) takes it down: its premise,
 * "auto-renew is off", no longer holds.
 */
export function useCancelSurvey(): {
  visible: boolean;
  /** Call when the card renders. Consumes the ask and emits `shown`. */
  presented: () => void;
  /** Record how the ask ended. The server's accepted verdict gates analytics. */
  finish: (response: CancelSurveyResponse) => void;
} {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const [appState, setAppState] = useState(AppState.currentState);

  const markShown = useMutation(api.cancelSurvey.markShown);
  const respond = useMutation(api.cancelSurvey.respond);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  // Fail closed: `undefined` (still loading / offline) never shows the card.
  const { data: surveyStatus } = useQuery(
    convexQuery(api.cancelSurvey.getStatus, userId ? {} : "skip"),
  );

  const [visible, setVisible] = useState(false);
  const episodeChecked = useRef(false);

  // A background→active transition opens a new episode: the next effect run
  // on Home may check RevenueCat again.
  useEffect(() => {
    if (appState !== "active") episodeChecked.current = false;
  }, [appState]);

  useEffect(() => {
    if (!home || appState !== "active" || !userId) return;
    if (episodeChecked.current) return;
    // Wait for the server gate without spending the episode: when it lands,
    // this effect re-runs and the check proceeds.
    if (surveyStatus === undefined) return;
    if (!isAnalyticsAvailable()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const state = await readRcTrialCancellation();
      // Interrupted (left Home mid-read): the episode is NOT consumed — the
      // flag below is only set on a completed check, so returning Home
      // retries detection in the same foreground session.
      if (cancelled) return;
      // Never compete with a paywall sheet for the moment — including one
      // that opened during the read. Poll until it clears rather than
      // spending the ask under a sheet (feedback-invitation's discipline).
      if (isPaywallPending()) {
        timer = setTimeout(() => void attempt(), PAYWALL_RECHECK_MS);
        return;
      }
      // Completed: the episode is spent only now, never at effect start —
      // an interrupted attempt must not block a retry.
      episodeChecked.current = true;
      if (state === "cancelled" && !surveyStatus.asked) {
        setVisible(true);
      } else if (state === "none") {
        // Renewal resumed: the card's premise no longer holds.
        setVisible(false);
      }
      // `unknown` leaves everything as-is; the next episode retries.
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [home, appState, userId, surveyStatus]);

  // The ask is presented once per mount: a remount of the card (feed
  // refresh, empty-feed ↔ feed branch switch) must not emit a second
  // `cancel_survey_shown` — the server markShown is idempotent, analytics
  // is not. A plain boolean suffices: an identity change unmounts Home (the
  // (app) layout redirects to sign-in), so this ref never outlives a user.
  const askPresented = useRef(false);
  const presented = useCallback(() => {
    if (!userId || askPresented.current) return;
    askPresented.current = true;
    // Only now is the ask spent — the card is on screen. Fire-and-forget:
    // the Convex client queues and retries the mutation if offline. The
    // verdict arbitrates the cross-device race: only the call that consumed
    // the ask may emit `shown`; a loser (another device got there first)
    // takes its card down and stays silent.
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

  // One response ever per mount: two rapid taps (or a tap racing dismiss)
  // must not emit duplicate events. Capture is gated on the server's verdict
  // too — two devices can race the same ask, and only the response this row
  // accepted may reach PostHog.
  const responded = useRef(false);
  const finish = useCallback(
    (response: CancelSurveyResponse) => {
      if (!userId || responded.current) return;
      responded.current = true;
      void respond(response)
        .then((result) => {
          if (!result.accepted) return;
          if (response.outcome === "submitted") {
            cancelSurveyAnalytics.submitted(response.reason);
          } else {
            cancelSurveyAnalytics.dismissed();
          }
        })
        .catch((error: unknown) => {
          // A rejected respond committed nothing: leave the card down and
          // re-arm the one-response lock so the re-earned ask (re-detected
          // on a later foreground episode) can still be answered.
          analytics.captureError("cancel_survey_response_failed", error);
          responded.current = false;
        });
      setVisible(false);
    },
    [userId, respond],
  );

  return { visible, presented, finish };
}

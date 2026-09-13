import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';
import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useMutation } from 'convex/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/current-user';
import { isHomeRootRoute } from '@/lib/feedback';
import { isPaywallPending, readRcTrialCancellation } from '@/lib/entitlement';
import { cancelSurveyAnalytics, type CancelSurveyReason } from '@/lib/cancel-survey';

/** Poll interval while a paywall sheet has the moment (feedback-invitation
 * uses the same cadence). */
const PAYWALL_RECHECK_MS = 2000;

/**
 * Drives the next-visit cancel survey card.
 *
 * Detection runs once per foreground episode while the user is on the Home
 * root, so cancelling in iPhone Settings or the Customer Center and
 * returning to Shelvr is caught on the spot — and a transient `unknown`
 * (identity sync not ready, fetch failure) simply retries on the next
 * episode instead of burning the launch.
 *
 * The ask is durably one-per-account (convex/cancelSurvey.ts). The server
 * row is the authority across devices and reinstalls; the hook fails closed
 * and never asks while the row's state is unknown (still loading) or asked.
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
  submit: (reason: CancelSurveyReason) => void;
  dismiss: () => void;
} {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const [appState, setAppState] = useState(AppState.currentState);

  const markShown = useMutation(api.cancelSurvey.markShown);
  const respond = useMutation(api.cancelSurvey.respond);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  // Fail closed: `undefined` (still loading / offline) never shows the card.
  const { data: surveyStatus } = useQuery(
    convexQuery(api.cancelSurvey.getStatus, userId ? {} : 'skip'),
  );

  const [visible, setVisible] = useState(false);
  const episodeChecked = useRef(false);

  // A background→active transition opens a new episode: the next effect run
  // on Home may check RevenueCat again.
  useEffect(() => {
    if (appState !== 'active') episodeChecked.current = false;
  }, [appState]);

  useEffect(() => {
    if (!home || appState !== 'active' || !userId) return;
    if (episodeChecked.current) return;
    // Wait for the server gate without spending the episode: when it lands,
    // this effect re-runs and the check proceeds.
    if (surveyStatus === undefined) return;
    if (!cancelSurveyAnalytics.isAvailable()) return;

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
      if (state === 'cancelled' && !surveyStatus.asked) {
        setVisible(true);
      } else if (state === 'none') {
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

  // The ask is presented once per user per mount: a remount of the card
  // (feed refresh, empty-feed ↔ feed branch switch) must not emit a second
  // `cancel_survey_shown` — the server markShown is idempotent, analytics
  // is not.
  const presentedFor = useRef<string | null>(null);
  const presented = useCallback(() => {
    if (!userId || presentedFor.current === userId) return;
    presentedFor.current = userId;
    // Only now is the ask spent — the card is on screen. Fire-and-forget:
    // the Convex client queues and retries the mutation if offline.
    cancelSurveyAnalytics.shown();
    void markShown({});
  }, [userId, markShown]);

  // One response ever per mount: two rapid taps (or a tap racing dismiss)
  // must not emit duplicate `cancel_survey_submitted` events. Capture is
  // gated on the server's verdict too — two devices can race the same ask,
  // and only the response this row accepted may reach PostHog.
  const responded = useRef(false);
  const submit = useCallback(
    (reason: CancelSurveyReason) => {
      if (!userId || responded.current) return;
      responded.current = true;
      void respond({ outcome: 'submitted', reason }).then((result) => {
        if (result.accepted) cancelSurveyAnalytics.submitted(reason);
      });
      setVisible(false);
    },
    [userId, respond],
  );

  const dismiss = useCallback(() => {
    if (!userId || responded.current) return;
    responded.current = true;
    void respond({ outcome: 'dismissed' }).then((result) => {
      if (result.accepted) cancelSurveyAnalytics.dismissed();
    });
    setVisible(false);
  }, [userId, respond]);

  return { visible, presented, submit, dismiss };
}

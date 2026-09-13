import { useCallback, useEffect, useRef, useState } from 'react';
import { useSegments } from 'expo-router';
import { useCurrentUser } from '@/lib/current-user';
import { isPaywallPending, readRcTrialCancellation } from '@/lib/entitlement';
import { isHomeRootRoute } from '@/lib/feedback';
import {
  cancelSurveyAnalytics,
  canShowCancelSurvey,
  markCancelSurveyShown,
  markCancelSurveySubmitted,
  readCancelSurveyState,
  type CancelSurveyReason,
} from '@/lib/cancel-survey';

/**
 * Drives the next-visit cancel survey card. The RevenueCat check runs at most
 * once per user per launch, and only once the user is on the Home root with
 * analytics available — so the card appears on the first Home visit after a
 * cancellation, never mid-flow, and never twice for an account.
 *
 * `unknown` RC states (SDK missing, sync not ready, fetch failure) simply
 * leave the ask unspent; the check runs again on the next launch.
 */
export function useCancelSurvey(): {
  visible: boolean;
  submit: (reason: CancelSurveyReason) => void;
  dismiss: () => void;
} {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const [visible, setVisible] = useState(false);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!home || !userId || visible) return;
    // Once per user per launch — the check is a network call to RevenueCat.
    if (checkedFor.current === userId) return;
    checkedFor.current = userId;
    if (!cancelSurveyAnalytics.isAvailable()) return;
    if (!canShowCancelSurvey(readCancelSurveyState(userId))) return;

    let cancelled = false;
    void (async () => {
      // Never compete with a paywall sheet for the moment.
      if (isPaywallPending()) return;
      const state = await readRcTrialCancellation();
      if (cancelled || state !== 'cancelled') return;
      const current = readCancelSurveyState(userId);
      if (!canShowCancelSurvey(current)) return;
      markCancelSurveyShown(userId);
      cancelSurveyAnalytics.shown();
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [home, userId, visible]);

  const submit = useCallback(
    (reason: CancelSurveyReason) => {
      if (!userId) return;
      markCancelSurveySubmitted(userId);
      cancelSurveyAnalytics.submitted(reason);
      setVisible(false);
    },
    [userId],
  );

  const dismiss = useCallback(() => {
    cancelSurveyAnalytics.dismissed();
    setVisible(false);
  }, []);

  return { visible, submit, dismiss };
}

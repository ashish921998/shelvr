import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';
import { useCurrentUser } from '@/lib/current-user';
import { isPaywallPending } from '@/lib/entitlement';
import {
  canShowInvitation,
  countEligibleSaves,
  feedbackAnalytics,
  FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS,
  isHomeRootRoute,
  isNativeReviewAttemptInFlight,
  lastNativeReviewPromptAt,
  readInvitationState,
  withReadyCount,
  writeInvitationState,
  type FeedbackFeedItem,
} from '@/lib/feedback';

/** Minimum settle time before showing, and the poll interval while a paywall is up. */
const INVITATION_RECHECK_MS = 2000;

/** `defer` suspends new invitations without touching state — Home sets it
 * while the cancel-survey card owns the Home moment, so the one-shot claim
 * (shownCount + 14-day gate) is never burned for an invitation that is
 * rendered behind the survey and never actually seen. */
export function useFeedbackInvitation(
  items: FeedbackFeedItem[] | undefined,
  opts: { defer?: boolean } = {},
) {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const busy = useBusySaving(items);
  const [appState, setAppState] = useState(AppState.currentState);
  const [invitedUser, setInvitedUser] = useState<string | null>(null);
  const [formUser, setFormUser] = useState<string | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  // A save that interrupts a visible invitation ends it. The next one has to
  // pass the gate again instead of reappearing the moment the save settles.
  if (busy && invitedUser !== null) setInvitedUser(null);

  useEffect(() => {
    if (!home || busy || appState !== 'active' || !items || !userId || formUser || opts.defer) return;
    if (!feedbackAnalytics.isAvailable()) return;
    const state = withReadyCount(readInvitationState(userId), countEligibleSaves(items));
    writeInvitationState(userId, state);

    const reviewAt = lastNativeReviewPromptAt();
    const delay = Math.max(INVITATION_RECHECK_MS, reviewAt === null ? 0
      : reviewAt + FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS - Date.now());
    if (!canShowInvitation(state, { now: Date.now() + delay, reviewPromptedAt: reviewAt })) return;

    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (AppState.currentState !== 'active') return;
      // Neither the paywall nor a pending native review check has a reactive
      // signal, so keep checking until they clear rather than dropping an
      // invitation nothing would re-trigger. The review check marks its
      // timestamp only once resolved; that mark is honored just below.
      if (isPaywallPending() || isNativeReviewAttemptInFlight()) {
        timer = setTimeout(attempt, INVITATION_RECHECK_MS);
        return;
      }
      if (!feedbackAnalytics.isAvailable()) return;
      const current = readInvitationState(userId);
      const now = Date.now();
      if (!canShowInvitation(current, { now, reviewPromptedAt: lastNativeReviewPromptAt() })) return;
      writeInvitationState(userId, {
        ...current, shownCount: current.shownCount + 1, lastShownAt: now,
      });
      feedbackAnalytics.invitationShown('home', current.readyCount);
      setInvitedUser(userId);
    };
    timer = setTimeout(attempt, delay);
    return () => clearTimeout(timer);
  }, [items, userId, home, busy, appState, formUser, opts.defer]);

  const openFeedbackFromInvitation = useCallback(() => {
    if (!userId) return;
    setInvitedUser(null);
    setFormUser(userId);
  }, [userId]);
  const dismissInvitation = useCallback(() => {
    feedbackAnalytics.invitationDismissed('home');
    setInvitedUser(null);
  }, []);
  const closeFeedback = useCallback(() => setFormUser(null), []);

  return {
    invitationVisible: !!userId && invitedUser === userId && home && !busy && appState === 'active',
    openFeedbackFromInvitation,
    dismissInvitation,
    modalOpen: !!userId && formUser === userId && home,
    closeFeedback,
  };
}

export function useBusySaving(items: FeedbackFeedItem[] | undefined): boolean {
  return items?.some((item) => item.status === 'processing') ?? false;
}

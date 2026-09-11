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
  lastNativeReviewPromptAt,
  readInvitationState,
  withReadyCount,
  writeInvitationState,
  type FeedbackFeedItem,
} from '@/lib/feedback';

export function useFeedbackInvitation(items: FeedbackFeedItem[] | undefined) {
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

  useEffect(() => {
    if (!home || busy || appState !== 'active' || !items || !userId || formUser) return;
    if (!feedbackAnalytics.isAvailable()) return;
    const state = withReadyCount(readInvitationState(userId), countEligibleSaves(items));
    writeInvitationState(userId, state);

    const reviewAt = lastNativeReviewPromptAt();
    const delay = Math.max(2000, reviewAt === null ? 0
      : reviewAt + FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS - Date.now());
    if (!canShowInvitation(state, { now: Date.now() + delay, reviewPromptedAt: reviewAt })) return;

    const timer = setTimeout(() => {
      if (AppState.currentState !== 'active' || isPaywallPending()) return;
      if (!feedbackAnalytics.isAvailable()) return;
      const current = readInvitationState(userId);
      const now = Date.now();
      if (!canShowInvitation(current, { now, reviewPromptedAt: lastNativeReviewPromptAt() })) return;
      writeInvitationState(userId, {
        ...current, shownCount: current.shownCount + 1, lastShownAt: now,
      });
      feedbackAnalytics.invitationShown('home', current.readyCount);
      setInvitedUser(userId);
    }, delay);
    return () => clearTimeout(timer);
  }, [items, userId, home, busy, appState, formUser]);

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

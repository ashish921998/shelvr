import Constants from 'expo-constants';
import { createMMKV } from 'react-native-mmkv';
import { analytics } from '@/lib/analytics';
import { posthog } from '@/lib/posthog';

/**
 * Lightweight in-app feedback.
 *
 * Privacy rules baked in below:
 * - Automatic events (invitation shown/dismissed, form opened) never carry
 *   message text, URLs, or saved-item content.
 * - The typed message is only published by `submitFeedback`, which runs on an
 *   explicit Send tap. Replay masks all text inputs globally (posthog.ts).
 */

export const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;
export const FEEDBACK_READY_SAVE_THRESHOLD = 3;
export const FEEDBACK_MAX_INVITATIONS_PER_ACCOUNT = 2;
export const FEEDBACK_INVITATION_RETRY_MS = 14 * 24 * 60 * 60 * 1000;
/** How long a native review prompt claims the moment it triggers. */
export const FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS = 90_000;

export type FeedbackSurface = 'home' | 'profile';

export type FeedbackFeedItem = {
  status: 'processing' | 'ready' | 'failed';
  fixtureKey?: string;
};

// --- eligibility ------------------------------------------------------------

/**
 * Real READY saves toward the threshold: fixture seeds (fixtureKey) never
 * count, and saves still processing or failed don't either.
 */
export function countEligibleSaves(items: FeedbackFeedItem[]): number {
  return items.filter(
    (item) => item.status === 'ready' && !item.fixtureKey,
  ).length;
}

export type FeedbackInvitationState = {
  readyCount: number;
  shownCount: number;
  lastShownAt: number | null;
  submitted: boolean;
};

export function emptyInvitationState(): FeedbackInvitationState {
  return { readyCount: 0, shownCount: 0, lastShownAt: null, submitted: false };
}

/** The count only grows: deleting saves must not rescind a reached threshold. */
export function withReadyCount(
  state: FeedbackInvitationState,
  feedCount: number,
): FeedbackInvitationState {
  return { ...state, readyCount: Math.max(state.readyCount, feedCount) };
}

export type InvitationGate = {
  now: number;
  reviewPromptedAt: number | null;
};

/**
 * The single decision for whether the inline home invitation may appear.
 * Caps: once per account, at most twice with a 14-day gap, never after a
 * submission, and never in the same breath as the native review prompt.
 */
export function canShowInvitation(
  state: FeedbackInvitationState,
  gate: InvitationGate,
): boolean {
  if (state.submitted) return false;
  if (state.readyCount < FEEDBACK_READY_SAVE_THRESHOLD) return false;
  if (state.shownCount >= FEEDBACK_MAX_INVITATIONS_PER_ACCOUNT) return false;
  if (state.shownCount > 0) {
    if (state.lastShownAt === null) return false;
    if (gate.now - state.lastShownAt < FEEDBACK_INVITATION_RETRY_MS) {
      return false;
    }
  }
  if (
    gate.reviewPromptedAt !== null &&
    gate.now - gate.reviewPromptedAt < FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

export function parseInvitationState(
  raw: string | undefined,
): FeedbackInvitationState {
  const fallback = emptyInvitationState();
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    readyCount:
      typeof record.readyCount === 'number' && record.readyCount > 0
        ? Math.floor(record.readyCount)
        : 0,
    shownCount:
      typeof record.shownCount === 'number' && record.shownCount > 0
        ? Math.floor(record.shownCount)
        : 0,
    lastShownAt: typeof record.lastShownAt === 'number' ? record.lastShownAt : null,
    submitted: record.submitted === true,
  };
}

// --- review-prompt coordination --------------------------------------------
// `useReviewPrompt` fires on the same 3-ready-saves threshold. It marks here
// when it claims the moment; the invitation defers while the mark is fresh.
// Session scope is enough — the native review flow only exists in-session.

let reviewPromptedAt: number | null = null;
let reviewAttemptInFlight = false;

export function markNativeReviewPrompted(): void {
  reviewPromptedAt = Date.now();
}

export function lastNativeReviewPromptAt(): number | null {
  return reviewPromptedAt;
}

/** The review prompt claims the moment before `StoreReview.hasAction()`
 * resolves and marks the timestamp only after. The invitation waits out this
 * window so a slow `hasAction()` cannot let both prompts appear together. */
export function setNativeReviewAttemptInFlight(inFlight: boolean): void {
  reviewAttemptInFlight = inFlight;
}

export function isNativeReviewAttemptInFlight(): boolean {
  return reviewAttemptInFlight;
}

// --- route gating -----------------------------------------------------------

/** True only while the focused route is the home tab's root screen. Anything
 * pushed on top (item detail, paywall, onboarding) fails this check. */
export function isHomeRootRoute(segments: readonly string[]): boolean {
  return (
    segments.length === 3 &&
    segments[0] === '(app)' &&
    segments[1] === '(tabs)' &&
    segments[2] === '(home)'
  );
}

// --- persistence ------------------------------------------------------------

const store = createMMKV({ id: 'feedback' });

const invitationKey = (userId: string) => `feedback.invitation.${userId}`;

export function readInvitationState(userId: string): FeedbackInvitationState {
  return parseInvitationState(store.getString(invitationKey(userId)));
}

export function writeInvitationState(
  userId: string,
  state: FeedbackInvitationState,
): void {
  store.set(invitationKey(userId), JSON.stringify(state));
}

export function markFeedbackSubmitted(userId: string): void {
  writeInvitationState(userId, {
    ...readInvitationState(userId),
    submitted: true,
  });
}

export function sanitizeFeedbackMessage(raw: string): string {
  return raw.trim().slice(0, FEEDBACK_MESSAGE_MAX_LENGTH);
}

// --- analytics boundary -----------------------------------------------------

export type FeedbackSubmitResult = 'queued' | 'unavailable' | 'failed';

export const feedbackAnalytics = {
  isAvailable(): boolean {
    return posthog !== undefined && !posthog.isDisabled && !posthog.optedOut;
  },

  invitationShown(surface: FeedbackSurface, readyCount: number): void {
    analytics.capture('feedback_invitation_shown', { surface, ready_count: readyCount });
  },

  invitationDismissed(surface: FeedbackSurface): void {
    analytics.capture('feedback_invitation_dismissed', { surface });
  },

  feedbackOpened(surface: FeedbackSurface): void {
    analytics.capture('feedback_opened', { surface });
  },

  /**
   * Publishes the typed message — called ONLY on an explicit Send tap.
   * 'queued' means captured into the local PostHog queue (best-effort flush
   * attempted), not acknowledged by a server.
   */
  async submitFeedback(
    surface: FeedbackSurface,
    message: string,
  ): Promise<FeedbackSubmitResult> {
    if (!posthog || posthog.isDisabled || posthog.optedOut) return 'unavailable';
    const sanitized = sanitizeFeedbackMessage(message);
    if (!sanitized) return 'failed';
    try {
      posthog.capture('feedback_submitted', {
        surface,
        message: sanitized,
        char_count: sanitized.length,
        environment: Constants.expoConfig?.extra?.variant ?? 'development',
        analytics_version: 1,
      });
    } catch {
      return 'failed';
    }
    // Flush so feedback leaves the device promptly; a failed flush still
    // leaves the event queued for the next batch.
    try {
      await posthog.flush();
    } catch {
      // Queued locally regardless.
    }
    return 'queued';
  },
};

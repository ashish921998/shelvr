import { createMMKV } from "react-native-mmkv";
import { analytics } from "@/lib/analytics";
import { isAnalyticsAvailable } from "@/lib/posthog";

export const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;
export const FEEDBACK_READY_SAVE_THRESHOLD = 3;
export const FEEDBACK_MAX_INVITATIONS_PER_ACCOUNT = 2;
const FEEDBACK_INVITATION_RETRY_MS = 14 * 24 * 60 * 60 * 1000;
export const FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS = 90_000;

export type FeedbackSurface = "home" | "profile";

export type FeedbackFeedItem = {
  status: "processing" | "ready" | "failed";
  fixtureKey?: string;
};

export function countEligibleSaves(items: FeedbackFeedItem[]): number {
  return items.filter((item) => item.status === "ready" && !item.fixtureKey)
    .length;
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

export function withReadyCount(
  state: FeedbackInvitationState,
  feedCount: number,
): FeedbackInvitationState {
  return { ...state, readyCount: Math.max(state.readyCount, feedCount) };
}

type InvitationGate = {
  now: number;
  reviewPromptedAt: number | null;
};

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
  if (typeof parsed !== "object" || parsed === null) return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    readyCount:
      typeof record.readyCount === "number" && record.readyCount > 0
        ? Math.floor(record.readyCount)
        : 0,
    shownCount:
      typeof record.shownCount === "number" && record.shownCount > 0
        ? Math.floor(record.shownCount)
        : 0,
    lastShownAt:
      typeof record.lastShownAt === "number" ? record.lastShownAt : null,
    submitted: record.submitted === true,
  };
}

let reviewPromptedAt: number | null = null;
let reviewAttemptInFlight = false;

export function markNativeReviewPrompted(): void {
  reviewPromptedAt = Date.now();
}

export function lastNativeReviewPromptAt(): number | null {
  return reviewPromptedAt;
}

export function setNativeReviewAttemptInFlight(inFlight: boolean): void {
  reviewAttemptInFlight = inFlight;
}

export function isNativeReviewAttemptInFlight(): boolean {
  return reviewAttemptInFlight;
}

export function isHomeRootRoute(segments: readonly string[]): boolean {
  return (
    segments.length === 3 &&
    segments[0] === "(app)" &&
    segments[1] === "(tabs)" &&
    segments[2] === "(home)"
  );
}

const store = createMMKV({ id: "feedback" });

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

export const feedbackAnalytics = {
  isAvailable(): boolean {
    return isAnalyticsAvailable();
  },

  invitationShown(surface: FeedbackSurface, readyCount: number): void {
    analytics.capture("feedback_invitation_shown", {
      surface,
      ready_count: readyCount,
    });
  },

  invitationDismissed(surface: FeedbackSurface): void {
    analytics.capture("feedback_invitation_dismissed", { surface });
  },

  feedbackOpened(surface: FeedbackSurface): void {
    analytics.capture("feedback_opened", { surface });
  },
};

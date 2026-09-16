import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_MAX_INVITATIONS_PER_ACCOUNT,
  FEEDBACK_READY_SAVE_THRESHOLD,
  FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS,
  canShowInvitation,
  countEligibleSaves,
  emptyInvitationState,
  feedbackAnalytics,
  isHomeRootRoute,
  lastNativeReviewPromptAt,
  markFeedbackSubmitted,
  markNativeReviewPrompted,
  parseInvitationState,
  readInvitationState,
  sanitizeFeedbackMessage,
  withReadyCount,
  writeInvitationState,
} from "./feedback";
import type { FeedbackInvitationState } from "./feedback";

const posthogMock = vi.hoisted(() => ({
  optedOut: false,
  isDisabled: false,
  capture: vi.fn(),
  flush: vi.fn(async () => undefined),
}));
vi.mock("@/lib/posthog", () => ({
  posthog: posthogMock,
  isAnalyticsAvailable: () => !posthogMock.isDisabled && !posthogMock.optedOut,
  afterIdentitySettles: (send: () => void) => send(),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { variant: "development" } } },
}));

// In-memory MMKV so the storage boundary is exercised without a native runtime.
const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => kv.get(key),
    set: (key: string, value: string) => void kv.set(key, value),
  }),
}));

const item = (
  overrides: Partial<{
    status: "processing" | "ready" | "failed";
    fixtureKey?: string;
  }> = {},
) => ({
  status: "ready" as const,
  ...overrides,
});

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  posthogMock.optedOut = false;
  posthogMock.isDisabled = false;
  vi.clearAllMocks();
  kv.clear();
});

it("does not invite or claim a submission when analytics is opted out or disabled", async () => {
  posthogMock.optedOut = true;
  expect(feedbackAnalytics.isAvailable()).toBe(false);
  expect(await feedbackAnalytics.submitFeedback("profile", "Feedback")).toBe(
    "unavailable",
  );
  posthogMock.optedOut = false;
  posthogMock.isDisabled = true;
  expect(feedbackAnalytics.isAvailable()).toBe(false);
  expect(await feedbackAnalytics.submitFeedback("profile", "Feedback")).toBe(
    "unavailable",
  );
  expect(posthogMock.capture).not.toHaveBeenCalled();
});

describe("countEligibleSaves", () => {
  it("crosses the threshold exactly at 3 real ready saves", () => {
    const two = [item(), item()];
    const three = [...two, item()];
    expect(countEligibleSaves(two)).toBe(2);
    expect(countEligibleSaves(three)).toBe(FEEDBACK_READY_SAVE_THRESHOLD);
  });

  it("excludes fixture seeds and saves that are not ready", () => {
    const items = [
      item(),
      item(),
      item({ fixtureKey: "qa" }),
      item({ status: "processing" }),
      item({ status: "failed" }),
    ];
    expect(countEligibleSaves(items)).toBe(2);
  });
});

describe("withReadyCount", () => {
  it("is monotonic — later deletions cannot rescind a reached threshold", () => {
    const reached = withReadyCount(emptyInvitationState(), 3);
    const afterDeletion = withReadyCount(reached, 1);
    expect(afterDeletion.readyCount).toBe(3);
  });
});

describe("canShowInvitation", () => {
  const eligible = (
    overrides: Partial<FeedbackInvitationState> = {},
  ): FeedbackInvitationState => ({
    ...emptyInvitationState(),
    readyCount: 3,
    ...overrides,
  });
  const gate = (
    overrides: { now?: number; reviewPromptedAt?: number | null } = {},
  ) => ({
    now: overrides.now ?? 1_000_000,
    reviewPromptedAt: overrides.reviewPromptedAt ?? null,
  });

  it("blocks below the threshold", () => {
    expect(canShowInvitation(eligible({ readyCount: 2 }), gate())).toBe(false);
  });

  it("allows a first show at the threshold", () => {
    expect(canShowInvitation(eligible(), gate())).toBe(true);
  });

  it("never shows after a submission", () => {
    expect(canShowInvitation(eligible({ submitted: true }), gate())).toBe(
      false,
    );
  });

  it("caps at two shows per account", () => {
    const shownTwice = eligible({
      shownCount: FEEDBACK_MAX_INVITATIONS_PER_ACCOUNT,
    });
    expect(canShowInvitation(shownTwice, gate())).toBe(false);
  });

  it("respects the 14-day gap between shows", () => {
    const shownOnce = eligible({ shownCount: 1, lastShownAt: 0 });
    const before = gate({ now: 14 * DAY - 1 });
    const after = gate({ now: 14 * DAY });
    expect(canShowInvitation(shownOnce, before)).toBe(false);
    expect(canShowInvitation(shownOnce, after)).toBe(true);
  });

  it("defers while the native review prompt is fresh", () => {
    const now = 1_000_000;
    const fresh = gate({
      now,
      reviewPromptedAt: now - (FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS - 1),
    });
    const cooled = gate({
      now,
      reviewPromptedAt: now - FEEDBACK_REVIEW_PROMPT_COOLDOWN_MS,
    });
    expect(canShowInvitation(eligible(), fresh)).toBe(false);
    expect(canShowInvitation(eligible(), cooled)).toBe(true);
  });
});

describe("invitation state persistence", () => {
  it("round-trips per account and treats garbage as empty", () => {
    writeInvitationState("user-1", {
      readyCount: 5,
      shownCount: 1,
      lastShownAt: 42,
      submitted: false,
    });
    expect(readInvitationState("user-1").readyCount).toBe(5);
    expect(readInvitationState("user-2")).toEqual(emptyInvitationState());

    kv.set("feedback.invitation.user-3", "{not json");
    expect(readInvitationState("user-3")).toEqual(emptyInvitationState());

    kv.set(
      "feedback.invitation.user-4",
      JSON.stringify({ readyCount: -3, shownCount: "x" }),
    );
    const sanitized = readInvitationState("user-4");
    expect(sanitized.readyCount).toBe(0);
    expect(sanitized.shownCount).toBe(0);
  });

  it("marks submissions without touching other fields", () => {
    writeInvitationState("user-1", {
      readyCount: 3,
      shownCount: 1,
      lastShownAt: 9,
      submitted: false,
    });
    markFeedbackSubmitted("user-1");
    const state = readInvitationState("user-1");
    expect(state.submitted).toBe(true);
    expect(state.shownCount).toBe(1);
  });
});

describe("parseInvitationState", () => {
  it("rejects non-object payloads", () => {
    expect(parseInvitationState('"just a string"')).toEqual(
      emptyInvitationState(),
    );
    expect(parseInvitationState("42")).toEqual(emptyInvitationState());
    expect(parseInvitationState(undefined)).toEqual(emptyInvitationState());
  });
});

describe("sanitizeFeedbackMessage", () => {
  it("trims whitespace and caps length", () => {
    expect(sanitizeFeedbackMessage("  hello  ")).toBe("hello");
    expect(sanitizeFeedbackMessage("a".repeat(5000)).length).toBe(1000);
  });
});

describe("isHomeRootRoute", () => {
  it("matches only the home tab's root", () => {
    expect(isHomeRootRoute(["(app)", "(tabs)", "(home)"])).toBe(true);
    expect(isHomeRootRoute(["(app)", "(tabs)", "(spaces)"])).toBe(false);
    expect(isHomeRootRoute(["(app)", "item", "[id]"])).toBe(false);
    expect(isHomeRootRoute(["(app)", "onboarding"])).toBe(false);
    expect(isHomeRootRoute(["(app)", "paywall"])).toBe(false);
    expect(isHomeRootRoute([])).toBe(false);
  });
});

describe("review prompt coordination", () => {
  it("records the mark with a session timestamp", () => {
    expect(lastNativeReviewPromptAt()).toBeNull();
    const before = Date.now();
    markNativeReviewPrompted();
    const at = lastNativeReviewPromptAt();
    expect(at).not.toBeNull();
    expect(at! >= before).toBe(true);
  });
});

describe("feedbackAnalytics.submitFeedback", () => {
  it("queues the typed message with base properties on an explicit send", async () => {
    const result = await feedbackAnalytics.submitFeedback(
      "home",
      "Love the feed",
    );
    expect(result).toBe("queued");
    expect(posthogMock.capture).toHaveBeenCalledWith("feedback_submitted", {
      surface: "home",
      message: "Love the feed",
      char_count: 13,
      environment: "development",
      analytics_version: 1,
    });
    expect(posthogMock.flush).toHaveBeenCalled();
  });

  it("reports failure honestly when capture throws", async () => {
    posthogMock.capture.mockImplementation(() => {
      throw new Error("boom");
    });
    const result = await feedbackAnalytics.submitFeedback("profile", "hello");
    expect(result).toBe("failed");
    posthogMock.capture.mockImplementation(() => {});
  });
});

describe("feedbackAnalytics automatic events", () => {
  it("carries surface metadata but never message content", () => {
    feedbackAnalytics.invitationShown("home", 3);
    feedbackAnalytics.invitationDismissed("home");
    feedbackAnalytics.feedbackOpened("profile");
    for (const call of posthogMock.capture.mock.calls) {
      const properties = call[1] as Record<string, unknown>;
      expect(properties.message).toBeUndefined();
      expect(
        properties.ready_count === undefined ||
          typeof properties.ready_count === "number",
      ).toBe(true);
    }
    expect(posthogMock.capture).toHaveBeenNthCalledWith(
      1,
      "feedback_invitation_shown",
      {
        surface: "home",
        ready_count: 3,
        environment: "development",
        analytics_version: 1,
      },
    );
    expect(posthogMock.capture).toHaveBeenNthCalledWith(
      2,
      "feedback_invitation_dismissed",
      {
        surface: "home",
        environment: "development",
        analytics_version: 1,
      },
    );
    expect(posthogMock.capture).toHaveBeenNthCalledWith(3, "feedback_opened", {
      surface: "profile",
      environment: "development",
      analytics_version: 1,
    });
  });
});

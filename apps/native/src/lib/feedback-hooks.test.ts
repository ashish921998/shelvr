// Tests for the two Home hooks that decide when to ask for feedback. They are
// effect-only hooks, so the shared slot-indexed React stand-in (see
// src/test/react-stand-in.ts) drives them without a renderer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNativeReviewAttemptInFlight,
  readInvitationState,
  setNativeReviewAttemptInFlight,
} from "./feedback";
import { useFeedbackInvitation } from "./feedback-invitation";
import { REVIEW_PROMPT_SETTLE_MS, useReviewPrompt } from "./review-prompt";
import { reactStandIn as react } from "../test/react-stand-in";

vi.mock("react", async () => {
  const { reactStandIn } = await import("../test/react-stand-in");
  return reactStandIn;
});

const mock = vi.hoisted(() => ({
  appState: { currentState: "active" },
  appStateListeners: new Set<(state: string) => void>(),
  segments: ["(app)", "(tabs)", "(home)"],
  user: { _id: "user-1" } as { _id: string } | null | undefined,
  paywallPending: false,
  keyboard: {
    visible: false,
    listeners: new Map<string, () => void>(),
  },
  hasAction: vi.fn(async () => true),
  requestReview: vi.fn(async () => undefined),
  capture: vi.fn(),
  markNativeReviewPrompted: vi.fn(),
  secure: new Map<string, string>(),
  kv: new Map<string, string>(),
  posthog: {
    optedOut: false,
    isDisabled: false,
    capture: vi.fn(),
    flush: vi.fn(async () => undefined),
  },
}));
vi.mock("react-native", () => ({
  AppState: Object.assign(mock.appState, {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mock.appStateListeners.add(listener);
      return { remove: () => void mock.appStateListeners.delete(listener) };
    },
  }),
  Keyboard: {
    isVisible: () => mock.keyboard.visible,
    addListener: (event: string, listener: () => void) => {
      mock.keyboard.listeners.set(event, listener);
      return { remove: () => void mock.keyboard.listeners.delete(event) };
    },
  },
}));
vi.mock("expo-router", () => ({ useSegments: () => mock.segments }));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user }),
}));
vi.mock("@/lib/entitlement", () => ({
  isPaywallPending: () => mock.paywallPending,
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mock.capture } }));
vi.mock("@/lib/posthog", () => ({
  posthog: mock.posthog,
  isAnalyticsAvailable: () =>
    !mock.posthog.isDisabled && !mock.posthog.optedOut,
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { variant: "development" } } },
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => mock.kv.get(key),
    set: (key: string, value: string) => void mock.kv.set(key, value),
  }),
}));
vi.mock("expo-store-review", () => ({
  hasAction: mock.hasAction,
  requestReview: mock.requestReview,
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.secure.get(key) ?? null,
  setItem: (key: string, value: string) => void mock.secure.set(key, value),
}));
// Keep the real gate and persistence; only the session mark is observed so
// one test cannot leak a 90s cooldown into the next.
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./feedback")>()),
  markNativeReviewPrompted: mock.markNativeReviewPrompted,
}));

const item = (
  overrides: Partial<{ status: "processing" | "ready" | "failed" }> = {},
) => ({
  status: "ready" as const,
  ...overrides,
});
const threeReady = () => [item(), item(), item()];
const setAppState = (state: string) => {
  mock.appState.currentState = state;
  for (const listener of mock.appStateListeners) listener(state);
};
const setKeyboard = (visible: boolean) => {
  mock.keyboard.visible = visible;
  mock.keyboard.listeners.get(
    visible ? "keyboardDidShow" : "keyboardDidHide",
  )?.();
};
const PROMPTED_KEY = "shelvr.review.prompted";

beforeEach(() => {
  vi.clearAllMocks();
  mock.appState.currentState = "active";
  mock.user = { _id: "user-1" };
  mock.paywallPending = false;
  mock.keyboard.visible = false;
  mock.segments = ["(app)", "(tabs)", "(home)"];
  mock.secure.clear();
  setNativeReviewAttemptInFlight(false);
  mock.kv.clear();
});

afterEach(() => {
  react.unmount();
});

describe("useFeedbackInvitation", () => {
  type Result = ReturnType<typeof useFeedbackInvitation>;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends a visible invitation when a save starts and does not bring it back after", () => {
    let items = threeReady();
    let result = react.mount(() => useFeedbackInvitation(items));
    expect(result.invitationVisible).toBe(false);

    vi.advanceTimersByTime(2000);
    result = react.rerender<Result>();
    expect(result.invitationVisible).toBe(true);
    expect(readInvitationState("user-1").shownCount).toBe(1);

    // A save starts: the invitation goes away.
    items = [...items, item({ status: "processing" })];
    result = react.rerender<Result>();
    expect(result.invitationVisible).toBe(false);

    // The save settles. The 14-day gap blocks a second show, so the ended
    // invitation must not simply reappear.
    items = [...threeReady(), item()];
    result = react.rerender<Result>();
    vi.advanceTimersByTime(2000);
    result = react.rerender<Result>();
    expect(result.invitationVisible).toBe(false);
    expect(readInvitationState("user-1").shownCount).toBe(1);
  });

  it("keeps checking while a paywall is up instead of dropping the invitation", () => {
    const items = threeReady();
    mock.paywallPending = true;
    react.mount(() => useFeedbackInvitation(items));

    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(false);
    expect(readInvitationState("user-1").shownCount).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(false);

    mock.paywallPending = false;
    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(true);
    expect(readInvitationState("user-1").shownCount).toBe(1);
    expect(mock.capture).toHaveBeenCalledWith("feedback_invitation_shown", {
      surface: "home",
      ready_count: 3,
    });
  });

  it("waits out a pending native review check so both prompts cannot appear together", () => {
    const items = threeReady();
    // useReviewPrompt has claimed the moment but hasAction() has not resolved,
    // so no timestamp is marked yet. The invitation must not slip in.
    setNativeReviewAttemptInFlight(true);
    react.mount(() => useFeedbackInvitation(items));

    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(false);
    expect(readInvitationState("user-1").shownCount).toBe(0);

    // The check resolved without a prompt (no review action): the window is
    // over and the invitation proceeds on its next tick. Had the prompt fired,
    // the mark it leaves is honored by the same attempt, as the cooldown
    // tests cover.
    setNativeReviewAttemptInFlight(false);
    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(true);
    expect(readInvitationState("user-1").shownCount).toBe(1);
  });

  it("defers its one-shot claim while the cancel survey owns the Home moment", () => {
    const items = threeReady();
    react.mount(() => useFeedbackInvitation(items, { defer: true }));

    // Long past the settle delay — no claim, no shown event, no gate burn.
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(2000);
    expect(react.rerender<Result>().invitationVisible).toBe(false);
    expect(readInvitationState("user-1").shownCount).toBe(0);
    expect(mock.capture).not.toHaveBeenCalledWith(
      "feedback_invitation_shown",
      expect.anything(),
    );
  });

  it("clears the paywall poll on unmount", () => {
    const items = threeReady();
    mock.paywallPending = true;
    react.mount(() => useFeedbackInvitation(items));
    vi.advanceTimersByTime(2000);
    expect(vi.getTimerCount()).toBe(1);
    react.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useReviewPrompt", () => {
  // Home must hold still for the settle window before the sheet may appear.
  const flush = () => vi.advanceTimersByTimeAsync(REVIEW_PROMPT_SETTLE_MS);

  type Feed = ReturnType<typeof threeReady>;
  /** Mounts the hook across a win: the first render is on an opened save,
   * and every later render is back on Home. */
  const mountFiled = (getItems: () => Feed, run: (feed: Feed) => void) => {
    mock.segments = ["(app)", "item", "[id]"];
    react.mount(() => run(getItems()));
    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the prompt only once the guards pass, right before requesting the review", async () => {
    const items = threeReady();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    // Home has not settled yet: nothing may be claimed.
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();

    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
    expect(mock.secure.get(PROMPTED_KEY)).toBe("true");
    expect(mock.markNativeReviewPrompted).toHaveBeenCalledOnce();
    expect(mock.capture).toHaveBeenCalledWith("review_prompted", {
      ready_count: 3,
    });
    expect(
      mock.markNativeReviewPrompted.mock.invocationCallOrder[0],
    ).toBeLessThan(mock.requestReview.mock.invocationCallOrder[0]);
  });

  it("records nothing when a guard fails after hasAction() resolves, and retries on the next return from a save", async () => {
    let items = threeReady();
    // A paywall opens while hasAction() is in flight.
    mock.hasAction.mockImplementationOnce(async () => {
      mock.paywallPending = true;
      return true;
    });
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();

    // The paywall closes and another save lands while Home stays up. That is
    // no longer the moment of the save, so nothing is asked.
    mock.paywallPending = false;
    items = [...items, item()];
    react.rerender();
    await flush();
    expect(mock.hasAction).toHaveBeenCalledOnce();
    expect(mock.requestReview).not.toHaveBeenCalled();

    // The next return from a save is a fresh moment: the attempt runs again.
    mock.segments = ["(app)", "item", "[id]"];
    react.rerender();
    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
    expect(mock.secure.get(PROMPTED_KEY)).toBe("true");
    expect(mock.markNativeReviewPrompted).toHaveBeenCalledOnce();
  });

  it("asks nothing when a save lands later on the visit that had no review action", async () => {
    let items = threeReady();
    mock.hasAction.mockResolvedValueOnce(false);
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    items = [...items, item()];
    react.rerender();
    await flush();
    expect(mock.hasAction).toHaveBeenCalledOnce();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(isNativeReviewAttemptInFlight()).toBe(false);
  });

  it("records nothing when the platform has no review action", async () => {
    const items = threeReady();
    mock.hasAction.mockResolvedValueOnce(false);
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();
  });

  it("waits while deferred, as in an account's first session", async () => {
    const items = threeReady();
    let defer = true;
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed, { defer }),
    );
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();
    expect(mock.requestReview).not.toHaveBeenCalled();

    defer = false;
    react.rerender();
    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
  });

  it("waits for the keyboard to go away, then for Home to settle", async () => {
    const items = threeReady();
    // Add was just closed with its keyboard still sliding away.
    setKeyboard(true);
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();

    setKeyboard(false);
    await vi.advanceTimersByTimeAsync(REVIEW_PROMPT_SETTLE_MS - 1);
    expect(mock.hasAction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.requestReview).toHaveBeenCalledOnce();
  });

  /** Holds hasAction() open until the test resolves it. */
  const pendingHasAction = () => {
    let resolve!: (value: boolean) => void;
    mock.hasAction.mockImplementationOnce(
      () => new Promise<boolean>((r) => (resolve = r)),
    );
    return (value = true) => resolve(value);
  };

  it("cancels an attempt when the keyboard shows while hasAction() is pending", async () => {
    const items = threeReady();
    const resolveHasAction = pendingHasAction();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    expect(mock.hasAction).toHaveBeenCalledOnce();

    // The keyboard shows and hides again before hasAction() answers.
    setKeyboard(true);
    setKeyboard(false);
    resolveHasAction();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);

    // A fresh attempt waits out a full settle window of its own.
    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
  });

  it("cancels an attempt when a hold starts while hasAction() is pending", async () => {
    const items = threeReady();
    let defer = false;
    const resolveHasAction = pendingHasAction();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed, { defer }),
    );
    await flush();

    // The feedback form opens during the check.
    defer = true;
    react.rerender();
    resolveHasAction();
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();

    defer = false;
    react.rerender();
    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
  });

  it("cancels an attempt when Home is left and re-entered while hasAction() is pending", async () => {
    const items = threeReady();
    const resolveHasAction = pendingHasAction();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();

    mock.segments = ["(app)", "item", "[id]"];
    react.rerender();
    // The cancelled check gave the invitation its moment back.
    expect(isNativeReviewAttemptInFlight()).toBe(false);
    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
    resolveHasAction();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.requestReview).not.toHaveBeenCalled();
    // The superseded check must not release the fresh attempt's hold.
    expect(isNativeReviewAttemptInFlight()).toBe(true);

    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
    expect(isNativeReviewAttemptInFlight()).toBe(false);
  });

  it("holds the feedback invitation through the settle window and releases it when Home is left", async () => {
    const items = threeReady();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    expect(isNativeReviewAttemptInFlight()).toBe(true);

    mock.segments = ["(app)", "item", "[id]"];
    react.rerender();
    expect(isNativeReviewAttemptInFlight()).toBe(false);
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();
  });

  it("records nothing when hasAction() resolves before the keyboard's render commits", async () => {
    const items = threeReady();
    // The keyboard is already up by the live read, though no show event has
    // reached the hook yet: only the re-check after the await stops it.
    mock.hasAction.mockImplementationOnce(async () => {
      mock.keyboard.visible = true;
      return true;
    });
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
  });

  it("never asks when the app opens onto a full Home with no save opened", async () => {
    const items = threeReady();
    react.mount(() => useReviewPrompt(items));
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();
    expect(isNativeReviewAttemptInFlight()).toBe(false);
  });

  it("does not count coming back from a screen that is not a save", async () => {
    const items = threeReady();
    mock.segments = ["(app)", "settings"];
    react.mount(() => useReviewPrompt(items));
    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();
  });

  it("lets the moment pass once another screen comes between the save and Home", async () => {
    const items = threeReady();
    mock.segments = ["(app)", "item", "[id]"];
    react.mount(() => useReviewPrompt(items));
    mock.segments = ["(app)", "settings"];
    react.rerender();
    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();
  });

  it("waits out a trip to the background, then settles again on return", async () => {
    const items = threeReady();
    mountFiled(
      () => items,
      (feed) => useReviewPrompt(feed),
    );
    setAppState("background");
    await flush();
    expect(mock.hasAction).not.toHaveBeenCalled();

    setAppState("active");
    await vi.advanceTimersByTimeAsync(REVIEW_PROMPT_SETTLE_MS - 1);
    expect(mock.hasAction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.requestReview).toHaveBeenCalledOnce();
  });
});

// Tests for the two Home hooks that decide when to ask for feedback. They are
// effect-only hooks, so a slot-indexed stand-in for React (below) drives them
// without a renderer: useState/useRef keep values by call order, useEffect
// diffs deps and runs cleanups, and a setState outside a render re-renders.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readInvitationState, setNativeReviewAttemptInFlight } from "./feedback";
import { useFeedbackInvitation } from "./feedback-invitation";
import { useReviewPrompt } from "./review-prompt";

const react = vi.hoisted(() => {
  type EffectSlot = { deps?: unknown[]; cleanup?: () => void };
  let slots: unknown[] = [];
  let effectSlots: EffectSlot[] = [];
  let cursor = 0;
  let hook: (() => unknown) | undefined;
  let rendering = false;
  let dirty = false;
  const pending: (() => void)[] = [];

  const render = (): unknown => {
    let result: unknown;
    rendering = true;
    do {
      dirty = false;
      cursor = 0;
      result = hook?.();
      while (pending.length) pending.shift()!();
    } while (dirty);
    rendering = false;
    return result;
  };
  const depsChanged = (prev: unknown[] | undefined, next: unknown[] | undefined) =>
    !prev || !next || prev.length !== next.length || prev.some((value, i) => !Object.is(value, next[i]));

  return {
    useState<T>(initial: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((prev: T) => T)) => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(slots[i] as T) : next;
        if (Object.is(value, slots[i])) return;
        slots[i] = value;
        if (rendering) dirty = true;
        else render();
      };
      return [slots[i] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i] as { current: T };
    },
    useCallback<T>(callback: T) {
      return callback;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      const prev = slots[i] as EffectSlot | undefined;
      if (prev && !depsChanged(prev.deps, deps)) return;
      const slot: EffectSlot = { deps };
      slots[i] = slot;
      effectSlots.push(slot);
      pending.push(() => {
        prev?.cleanup?.();
        const cleanup = effect();
        if (typeof cleanup === "function") slot.cleanup = cleanup;
      });
    },
    mount<T>(run: () => T): T {
      slots = [];
      effectSlots = [];
      hook = run;
      return render() as T;
    },
    rerender<T>(): T {
      return render() as T;
    },
    unmount() {
      for (const slot of effectSlots) slot.cleanup?.();
      slots = [];
      effectSlots = [];
      hook = undefined;
    },
  };
});
vi.mock("react", () => react);

const mock = vi.hoisted(() => ({
  appState: { currentState: "active" },
  segments: ["(app)", "(tabs)", "(home)"],
  user: { _id: "user-1" } as { _id: string } | null | undefined,
  paywallPending: false,
  hasAction: vi.fn(async () => true),
  requestReview: vi.fn(async () => undefined),
  capture: vi.fn(),
  markNativeReviewPrompted: vi.fn(),
  secure: new Map<string, string>(),
  kv: new Map<string, string>(),
  posthog: { optedOut: false, isDisabled: false, capture: vi.fn(), flush: vi.fn(async () => undefined) },
}));
vi.mock("react-native", () => ({
  AppState: Object.assign(mock.appState, {
    addEventListener: () => ({ remove: () => undefined }),
  }),
}));
vi.mock("expo-router", () => ({ useSegments: () => mock.segments }));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: () => ({ data: mock.user }) }));
vi.mock("@/lib/entitlement", () => ({ isPaywallPending: () => mock.paywallPending }));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mock.capture } }));
vi.mock("@/lib/posthog", () => ({ posthog: mock.posthog }));
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

const item = (overrides: Partial<{ status: "processing" | "ready" | "failed" }> = {}) => ({
  status: "ready" as const,
  ...overrides,
});
const threeReady = () => [item(), item(), item()];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const PROMPTED_KEY = "shelvr.review.prompted";

beforeEach(() => {
  vi.clearAllMocks();
  mock.appState.currentState = "active";
  mock.user = { _id: "user-1" };
  mock.paywallPending = false;
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
    expect(mock.capture).toHaveBeenCalledWith("feedback_invitation_shown", { surface: "home", ready_count: 3 });
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
  it("records the prompt only once the guards pass, right before requesting the review", async () => {
    const items = threeReady();
    react.mount(() => useReviewPrompt(items));
    // hasAction() is still pending: nothing may be claimed yet.
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();

    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
    expect(mock.secure.get(PROMPTED_KEY)).toBe("true");
    expect(mock.markNativeReviewPrompted).toHaveBeenCalledOnce();
    expect(mock.capture).toHaveBeenCalledWith("review_prompted", { ready_count: 3 });
    expect(mock.markNativeReviewPrompted.mock.invocationCallOrder[0])
      .toBeLessThan(mock.requestReview.mock.invocationCallOrder[0]);
  });

  it("records nothing when a guard fails after hasAction() resolves, and retries later", async () => {
    let items = threeReady();
    // A paywall opens while hasAction() is in flight.
    mock.hasAction.mockImplementationOnce(async () => {
      mock.paywallPending = true;
      return true;
    });
    react.mount(() => useReviewPrompt(items));
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();

    // The paywall closes and the feed changes: the attempt runs again.
    mock.paywallPending = false;
    items = [...items, item()];
    react.rerender();
    await flush();
    expect(mock.requestReview).toHaveBeenCalledOnce();
    expect(mock.secure.get(PROMPTED_KEY)).toBe("true");
    expect(mock.markNativeReviewPrompted).toHaveBeenCalledOnce();
  });

  it("records nothing when the platform has no review action", async () => {
    const items = threeReady();
    mock.hasAction.mockResolvedValueOnce(false);
    react.mount(() => useReviewPrompt(items));
    await flush();
    expect(mock.requestReview).not.toHaveBeenCalled();
    expect(mock.secure.has(PROMPTED_KEY)).toBe(false);
    expect(mock.markNativeReviewPrompted).not.toHaveBeenCalled();
  });
});

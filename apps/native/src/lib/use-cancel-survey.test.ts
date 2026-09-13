// Tests for the hook that decides when the cancel-survey card may appear.
// Effect-only hook, driven by the same slot-indexed React stand-in used by
// feedback-hooks.test.ts: useState/useRef keep values by call order,
// useEffect diffs deps and runs cleanups, and a setState outside a render
// re-renders. The AppState mock records listeners so tests can simulate
// backgrounding and returning from iPhone Settings / Customer Center.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCancelSurvey } from "./use-cancel-survey";

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
  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined,
  ) =>
    !prev ||
    !next ||
    prev.length !== next.length ||
    prev.some((value, i) => !Object.is(value, next[i]));

  return {
    useState<T>(initial: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((prev: T) => T)) => {
        const value =
          typeof next === "function"
            ? (next as (prev: T) => T)(slots[i] as T)
            : next;
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
  appState: "active" as string,
  appStateListeners: [] as ((state: string) => void)[],
  segments: ["(app)", "(tabs)", "(home)"],
  user: { _id: "user-1" } as { _id: string } | null | undefined,
  rcState: "cancelled" as "cancelled" | "none" | "unknown",
  rcGate: null as Promise<void> | null,
  surveyStatus: { asked: false } as { asked: boolean } | undefined,
  paywallPending: false,
  markShown: vi.fn(async () => ({ accepted: true })),
  respond: vi.fn(async () => ({ accepted: true })),
  capture: vi.fn(),
  // useMutation call counter — see the convex/react mock below.
  mutationCalls: 0,
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return mock.appState;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mock.appStateListeners.push(listener);
      return { remove: () => undefined };
    },
  },
}));
vi.mock("expo-router", () => ({ useSegments: () => mock.segments }));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user }),
}));
vi.mock("@/lib/entitlement", () => ({
  readRcTrialCancellation: vi.fn(async () => {
    if (mock.rcGate) await mock.rcGate;
    return mock.rcState;
  }),
  isPaywallPending: () => mock.paywallPending,
}));
vi.mock("@/lib/feedback", () => ({
  isHomeRootRoute: () => mock.segments[2] === "(home)",
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mock.capture } }));
vi.mock("@/lib/posthog", () => ({ isAnalyticsAvailable: () => true }));
vi.mock("convex/react", () => ({
  // A dynamic import inside a vi.mock factory resolves to a different
  // _generated/api instance than the hook's import, so the mutation cannot
  // be routed by reference. Route by call order instead: the hook calls
  // useMutation for markShown, then respond, on every render — exactly two
  // calls per render keeps the parity stable.
  useMutation: () => {
    mock.mutationCalls += 1;
    return mock.mutationCalls % 2 === 1 ? mock.markShown : mock.respond;
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: unknown, args: unknown) => ({ ref, args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mock.surveyStatus }),
}));

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

type Survey = ReturnType<typeof useCancelSurvey>;
/** mount/rerender return a fresh result object per render — always read the
 * current one after an await. */
const latest = (): Survey => react.rerender<Survey>();

/** Simulate leaving Shelvr (e.g. to iPhone Settings) and coming back. */
const roundTrip = async () => {
  for (const listener of mock.appStateListeners) listener("background");
  await flush();
  for (const listener of mock.appStateListeners) listener("active");
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  // Fake only the retry timer (2s paywall poll); setImmediate-based flush
  // and promise microtasks stay real so async detection resolves normally.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mock.appState = "active";
  mock.appStateListeners = [];
  mock.segments = ["(app)", "(tabs)", "(home)"];
  mock.user = { _id: "user-1" };
  mock.rcState = "cancelled";
  mock.rcGate = null;
  mock.surveyStatus = { asked: false };
  mock.paywallPending = false;
  mock.mutationCalls = 0;
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  react.unmount();
});

describe("useCancelSurvey", () => {
  it("shows the card when RevenueCat reports a cancelled trial and the ask is unspent", async () => {
    react.mount(() => useCancelSurvey());
    await flush();

    expect(latest().visible).toBe(true);
    // Detection alone must not consume the ask (P2b).
    expect(mock.markShown).not.toHaveBeenCalled();
    expect(mock.capture).not.toHaveBeenCalledWith("cancel_survey_shown");
  });

  it("consumes the ask and emits shown only when the card is presented", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    latest().presented();
    await flush(); // shown fires on the server's accepted verdict

    expect(mock.markShown).toHaveBeenCalledWith({});
    expect(mock.capture).toHaveBeenCalledWith("cancel_survey_shown");
  });

  it("never shows the card when the account was already asked (another device / reinstall)", async () => {
    mock.surveyStatus = { asked: true };
    react.mount(() => useCancelSurvey());
    await flush();

    expect(latest().visible).toBe(false);
    expect(mock.markShown).not.toHaveBeenCalled();
  });

  it("fails closed while the server answer is still loading, then proceeds without spending the episode", async () => {
    mock.surveyStatus = undefined;
    react.mount(() => useCancelSurvey());
    await flush();
    // No check happened: nothing is visible and the episode was not spent.
    expect(latest().visible).toBe(false);

    mock.surveyStatus = { asked: false };
    latest(); // render picks up the server answer; the check is scheduled
    await flush(); // async RevenueCat read resolves and flips visibility

    expect(latest().visible).toBe(true);
  });

  it("re-checks after returning from Settings: a cancellation made mid-session is caught", async () => {
    mock.rcState = "none"; // session starts with the trial still renewing
    react.mount(() => useCancelSurvey());
    await flush();
    expect(latest().visible).toBe(false);

    mock.rcState = "cancelled"; // user cancelled in iPhone Settings meanwhile
    await roundTrip();

    expect(latest().visible).toBe(true);
  });

  it("takes the card down when renewal resumes while it is visible", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    expect(latest().visible).toBe(true);

    mock.rcState = "none"; // uncancelled elsewhere
    await roundTrip();

    expect(latest().visible).toBe(false);
  });

  it("does not check away from the Home root", async () => {
    mock.segments = ["(app)", "(tabs)", "(spaces)"];
    react.mount(() => useCancelSurvey());
    await flush();

    expect(latest().visible).toBe(false);
  });

  it("submit records the outcome server-side and closes the card", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    latest().submit("too_expensive");
    await flush(); // capture is gated on the server's accepted verdict
    expect(mock.respond).toHaveBeenCalledWith({
      outcome: "submitted",
      reason: "too_expensive",
    });
    expect(mock.capture).toHaveBeenCalledWith("cancel_survey_submitted", {
      reason: "too_expensive",
      survey_source: "next_visit_card",
    });
    expect(latest().visible).toBe(false);
  });

  it("dismiss records the outcome server-side and closes the card", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    latest().dismiss();
    await flush();
    expect(mock.respond).toHaveBeenCalledWith({ outcome: "dismissed" });
    expect(latest().visible).toBe(false);
  });

  it("captures nothing when another device already answered the ask", async () => {
    mock.respond.mockResolvedValueOnce({ accepted: false });
    react.mount(() => useCancelSurvey());
    await flush();
    latest().submit("too_expensive");
    await flush();

    expect(mock.respond).toHaveBeenCalledTimes(1);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_submitted",
      ),
    ).toHaveLength(0);
    expect(latest().visible).toBe(false);
  });

  it("retries detection when the user leaves Home mid-read and returns", async () => {
    let release!: () => void;
    mock.rcGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    react.mount(() => useCancelSurvey());
    await flush(); // first read is gated in flight
    expect(latest().visible).toBe(false);

    // Navigate away mid-read: the attempt is cancelled and must not consume
    // the foreground episode.
    mock.segments = ["(app)", "(tabs)", "(search)"];
    react.rerender();
    release();
    await flush(); // stale read resolves into the void

    mock.segments = ["(app)", "(tabs)", "(home)"];
    react.rerender();
    await flush(); // a fresh, complete read in the same session

    const { readRcTrialCancellation } = await import("@/lib/entitlement");
    expect(vi.mocked(readRcTrialCancellation)).toHaveBeenCalledTimes(2);
    expect(latest().visible).toBe(true);
  });

  it("waits out a paywall sheet instead of spending the ask under it", async () => {
    mock.paywallPending = true;
    react.mount(() => useCancelSurvey());
    await flush(); // read resolves, sees the sheet, schedules a retry
    expect(latest().visible).toBe(false);
    expect(mock.markShown).not.toHaveBeenCalled();

    mock.paywallPending = false; // the sheet closes
    vi.advanceTimersByTime(2000);
    await flush();

    expect(latest().visible).toBe(true);
  });

  it("emits shown once per ask even when the card remounts", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    const survey = latest();
    survey.presented(); // e.g. empty-feed → feed branch switch remounts it
    survey.presented();
    await flush(); // shown fires on the server's accepted verdict

    expect(mock.markShown).toHaveBeenCalledTimes(1);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(1);
  });

  it("takes the card down and emits nothing when another device won the ask", async () => {
    mock.markShown.mockResolvedValueOnce({ accepted: false });
    react.mount(() => useCancelSurvey());
    await flush();
    expect(latest().visible).toBe(true);

    latest().presented();
    await flush(); // the loser's verdict lands

    expect(mock.markShown).toHaveBeenCalledTimes(1);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(0);
    expect(latest().visible).toBe(false);
  });

  it("keeps the card up when the row turns asked while our own verdict is in flight, then counts the win", async () => {
    let release!: (value: { accepted: boolean }) => void;
    mock.markShown.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    react.mount(() => useCancelSurvey());
    await flush();
    latest().presented();

    // The asked flip can be this device's own markShown insert propagating
    // through the live query before the mutation's resolution arrives. A
    // pending claim is not a lost claim: the card must survive until this
    // device's verdict lands, or the account's one ask is stranded.
    mock.surveyStatus = { asked: true };
    latest();
    expect(latest().visible).toBe(true);

    release({ accepted: true });
    await flush();
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(1);
    expect(latest().visible).toBe(true);
  });

  it("takes the card down when the in-flight verdict comes back rejected", async () => {
    let release!: (value: { accepted: boolean }) => void;
    mock.markShown.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    react.mount(() => useCancelSurvey());
    await flush();
    latest().presented();

    // Same asked flip as above, but this device lost the race. Pending
    // keeps the card; the rejected verdict is what retires it — silently.
    mock.surveyStatus = { asked: true };
    latest();
    expect(latest().visible).toBe(true);

    release({ accepted: false });
    await flush();
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(0);
    expect(latest().visible).toBe(false);
  });

  it("takes the card down when the markShown verdict fails outright", async () => {
    mock.markShown.mockRejectedValueOnce(new Error("convex unavailable"));
    react.mount(() => useCancelSurvey());
    await flush();
    latest().presented();
    await flush();

    // A failed verdict never committed, so the ask is unspent — but this
    // mount cannot cite a win. Fail closed and let a later mount re-ask.
    expect(latest().visible).toBe(false);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(0);
  });

  it("double-tapping a reason submits exactly once", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    const survey = latest();
    survey.submit("too_expensive");
    survey.submit("other"); // second tap lands before the re-render hides the card
    await flush();

    expect(mock.respond).toHaveBeenCalledTimes(1);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_submitted",
      ),
    ).toHaveLength(1);
    expect(latest().visible).toBe(false);
  });

  it("ignores a dismiss racing a submit", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    const survey = latest();
    survey.submit("too_expensive");
    survey.dismiss();

    expect(mock.respond).toHaveBeenCalledTimes(1);
    expect(mock.respond).toHaveBeenCalledWith({
      outcome: "submitted",
      reason: "too_expensive",
    });
  });
});

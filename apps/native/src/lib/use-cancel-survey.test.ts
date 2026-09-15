// @vitest-environment jsdom
// Real React effects and callbacks, with native events supplied by the test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCancelSurvey } from "./use-cancel-survey";
import { getPendingCancelSurvey } from "./pending-cancel-survey";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));

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
  respond: vi.fn(
    async (_response: {
      outcome: "submitted" | "dismissed";
      reason?:
        | "other"
        | "too_expensive"
        | "not_useful_enough"
        | "missing_feature";
    }) => ({ accepted: true }),
  ),
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
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
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

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
};

type Survey = ReturnType<typeof useCancelSurvey>;
let rendered: ReturnType<typeof renderHook<Survey, void>> | undefined;
const react = {
  mount(run: () => Survey) {
    rendered = renderHook(run);
    return rendered.result.current;
  },
  rerender() {
    if (!rendered) throw new Error("Hook not mounted");
    rendered.rerender();
    const current = rendered.result.current;
    return {
      ...current,
      presented: () => act(() => current.presented()),
      finish: (response: Parameters<Survey["finish"]>[0]) =>
        act(() => current.finish(response)),
    };
  },
  unmount() {
    rendered?.unmount();
    rendered = undefined;
  },
};
/** mount/rerender return a fresh result object per render — always read the
 * current one after an await. */
const latest = (): Survey => react.rerender();

/** Simulate leaving Shelvr (e.g. to iPhone Settings) and coming back. */
const roundTrip = async () => {
  act(() => {
    for (const listener of mock.appStateListeners) listener("background");
  });
  await flush();
  act(() => {
    for (const listener of mock.appStateListeners) listener("active");
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  mock.markShown.mockReset().mockImplementation(async () => {
    mock.surveyStatus = { asked: true };
    return { accepted: true };
  });
  mock.respond.mockReset().mockResolvedValue({ accepted: true });
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
    // Detection alone must not consume the ask.
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

  it("finish records the submitted outcome server-side and closes the card", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    latest().finish({ outcome: "submitted", reason: "too_expensive" });
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

  it("finish records the dismissed outcome server-side and closes the card", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    latest().finish({ outcome: "dismissed" });
    await flush();
    expect(mock.respond).toHaveBeenCalledWith({ outcome: "dismissed" });
    expect(latest().visible).toBe(false);
  });

  it("captures nothing when another device already answered the ask", async () => {
    mock.respond.mockResolvedValueOnce({ accepted: false });
    react.mount(() => useCancelSurvey());
    await flush();
    latest().finish({ outcome: "submitted", reason: "too_expensive" });
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

  it("retries a failed claim on the next foreground visit", async () => {
    mock.markShown.mockRejectedValueOnce(new Error("claim failed"));
    react.mount(() => useCancelSurvey());
    await flush();
    latest().presented();
    await flush();
    expect(latest().visible).toBe(false);
    await roundTrip();
    expect(latest().visible).toBe(true);
    latest().presented();
    await flush();
    expect(mock.markShown).toHaveBeenCalledTimes(2);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_shown",
      ),
    ).toHaveLength(1);
  });

  it.each(["foreground", "relaunch"])(
    "retries the saved response on %s after the real server has consumed the ask",
    async (resume) => {
      const { newConvexTest } = await import("../../convex/test.setup");
      const { api } = await import("../../convex/_generated/api");
      const backend = newConvexTest();
      const user = backend.withIdentity({ subject: "user-1|session" });
      mock.surveyStatus = await user.query(api.cancelSurvey.getStatus, {});
      mock.markShown.mockImplementation(async () => {
        const result = await user.mutation(api.cancelSurvey.markShown, {});
        mock.surveyStatus = await user.query(api.cancelSurvey.getStatus, {});
        return result;
      });
      mock.respond.mockImplementation((response) =>
        user.mutation(api.cancelSurvey.respond, response),
      );
      mock.respond.mockRejectedValueOnce(new Error("response failed"));
      react.mount(() => useCancelSurvey());
      await flush();
      latest().presented();
      await mock.markShown.mock.results[0].value;
      await flush();
      latest().finish({ outcome: "submitted", reason: "other" });
      await flush();

      expect(latest().visible).toBe(false);
      expect(await user.query(api.cancelSurvey.getStatus, {})).toEqual({
        asked: true,
      });
      expect(getPendingCancelSurvey("user-1")).toEqual({
        outcome: "submitted",
        reason: "other",
      });
      expect(
        mock.capture.mock.calls.filter(
          ([name]) => name === "cancel_survey_submitted",
        ),
      ).toHaveLength(0);

      if (resume === "foreground") await roundTrip();
      else {
        react.unmount();
        react.mount(() => useCancelSurvey());
      }
      await flush();
      await mock.respond.mock.results[1].value;
      await flush();
      expect(latest().visible).toBe(false);
      expect(mock.respond).toHaveBeenCalledTimes(2);
      expect(mock.markShown).toHaveBeenCalledTimes(1);
      expect(getPendingCancelSurvey("user-1")).toBeNull();
      const rows = await backend.run((ctx) =>
        ctx.db.query("cancelSurveys").collect(),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: "submitted", reason: "other" });
      expect(mock.capture).toHaveBeenCalledWith("cancel_survey_submitted", {
        reason: "other",
        survey_source: "next_visit_card",
      });
    },
  );

  it("double-tapping a reason submits exactly once", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    const survey = latest();
    survey.finish({ outcome: "submitted", reason: "too_expensive" });
    survey.finish({ outcome: "submitted", reason: "other" }); // second tap lands before the re-render hides the card
    await flush();

    expect(mock.respond).toHaveBeenCalledTimes(1);
    expect(
      mock.capture.mock.calls.filter(
        ([name]) => name === "cancel_survey_submitted",
      ),
    ).toHaveLength(1);
    expect(latest().visible).toBe(false);
  });

  it("ignores a dismissed outcome racing a submitted one", async () => {
    react.mount(() => useCancelSurvey());
    await flush();
    const survey = latest();
    survey.finish({ outcome: "submitted", reason: "too_expensive" });
    survey.finish({ outcome: "dismissed" });

    expect(mock.respond).toHaveBeenCalledTimes(1);
    expect(mock.respond).toHaveBeenCalledWith({
      outcome: "submitted",
      reason: "too_expensive",
    });
  });
});

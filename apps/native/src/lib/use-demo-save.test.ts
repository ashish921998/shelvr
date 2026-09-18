// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoError } from "@convex/model/demoErrors";
import {
  demoSaveReducer,
  deriveDemoView,
  initialDemoSaveState,
  linkFromText,
  retryErrorKey,
  useDemoSave,
} from "./use-demo-save";

const mock = vi.hoisted(() => ({
  authenticated: true,
  create: vi.fn(),
  retry: vi.fn(),
  query: {
    data: undefined as
      | { status: string; url?: string; failureReason?: string }
      | null
      | undefined,
    isError: false,
    isSuccess: false,
  },
  queryArgs: undefined as unknown,
  capture: vi.fn(),
  setPendingDemo: vi.fn(),
  recordShareSaved: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
  useMutation: (ref: string) => (ref === "create" ? mock.create : mock.retry),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    demo: { createDemoItem: "create", retryDemoItem: "retry" },
    items: { getItem: "getItem" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: unknown, args: unknown) => ({ ref, args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { args: unknown }) => {
    mock.queryArgs = options.args;
    return mock.query;
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: mock.capture,
    captureError: vi.fn(),
    sessionId: () => "session",
  },
}));
vi.mock("@/lib/pending-onboarding", () => ({
  setPendingDemo: mock.setPendingDemo,
  clearLegacyDemoUrlIfSaved: vi.fn(),
  resolveOnboardingSpaceName: (id: string) => `name:${id}`,
}));
vi.mock("@/lib/onboarding-demo", () => ({
  demoDestination: (url: string) =>
    url === "https://sample.test/recipe" ? "recipes" : null,
}));
vi.mock("@/lib/first-share", () => ({
  recordShareSaved: mock.recordShareSaved,
}));

const ITEM_ID = "item-1";
const saved = (reused = false) => ({
  itemId: ITEM_ID,
  url: "https://example.com/",
  reused,
  savedSpaceNames: [],
});

function renderDemo(
  resume: { url: string; destination: null; viaShare: boolean } | null = null,
  userId: string | null = null,
) {
  const onSaved = vi.fn();
  const onAdvance = vi.fn();
  // A bare rerender() passes undefined here, so fall back to the initial id.
  const hook = renderHook(
    (props?: { userId: string | null }) =>
      useDemoSave({
        spaces: ["recipes"],
        resume,
        onSaved,
        onAdvance,
        userId: props ? props.userId : userId,
      }),
    { initialProps: { userId } },
  );
  return { ...hook, onSaved, onAdvance };
}

// The save resolves over a few microtasks; fake timers leave promises alone.
async function flush(run: () => void) {
  await act(async () => {
    run();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

function captured(event: string) {
  return mock.capture.mock.calls.filter(([name]) => name === event);
}

beforeEach(() => {
  mock.authenticated = true;
  mock.create.mockReset();
  mock.retry.mockReset();
  mock.capture.mockReset();
  mock.setPendingDemo.mockReset();
  mock.recordShareSaved.mockReset();
  mock.query = { data: undefined, isError: false, isSuccess: false };
  mock.queryArgs = undefined;
});

describe("useDemoSave", () => {
  it("asks for sign-in first, then saves the same link once signed in", async () => {
    mock.authenticated = false;
    mock.create.mockResolvedValue(saved());
    const { result, rerender, onSaved } = renderDemo();

    act(() => result.current.submitUrl("https://sample.test/recipe"));
    expect(result.current.view).toBe("auth");
    expect(result.current.authUrl).toBe("https://sample.test/recipe");
    expect(mock.setPendingDemo).toHaveBeenCalledWith({
      url: "https://sample.test/recipe",
      destination: "name:recipes",
      viaShare: false,
    });
    expect(mock.create).not.toHaveBeenCalled();

    mock.authenticated = true;
    rerender();
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledWith({
      url: "https://sample.test/recipe",
      spaceName: "name:recipes",
      analyticsSessionId: "session",
    });
    expect(onSaved).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      savedSpaceNames: [],
    });
    expect(mock.queryArgs).toEqual({ id: ITEM_ID });
    expect(captured("onboarding_demo_submitted")).toHaveLength(1);
  });

  it("does not count a resumed save the server already had", async () => {
    mock.create.mockResolvedValue(saved(true));
    const { result } = renderDemo({
      url: "https://example.com/",
      destination: null,
      viaShare: false,
    });
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(captured("onboarding_demo_submitted")).toHaveLength(0);
  });

  it("lets the user on without a save after a failed submit", async () => {
    mock.create.mockRejectedValue(new Error("offline"));
    const { result, onAdvance } = renderDemo();
    expect(result.current.canSkip).toBe(false);

    await flush(() => result.current.submitUrl("https://example.com/"));
    expect(result.current.view).toBe("share");
    expect(result.current.error).toBe("demo.saveFailed");
    expect(result.current.canSkip).toBe(true);
    expect(captured("onboarding_demo_result")).toEqual([
      ["onboarding_demo_result", { outcome: "error" }],
    ]);

    mock.setPendingDemo.mockClear();
    act(() => result.current.skip());
    act(() => result.current.skip());
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(captured("onboarding_demo_skipped")).toHaveLength(1);
    expect(mock.setPendingDemo).toHaveBeenCalledWith(null);
  });

  it("offers continue, not skip, once the demo save is used up", async () => {
    mock.create.mockRejectedValue(demoError("demo_used"));
    const { result } = renderDemo();
    await flush(() => result.current.submitUrl("https://example.com/"));
    expect(result.current.demoUsed).toBe(true);
    expect(result.current.canSkip).toBe(false);
    expect(result.current.error).toBe("demo.alreadyUsed");
  });

  it("rejects typed text without a link before it reaches the server", () => {
    const { result } = renderDemo();
    act(() => result.current.submitTyped("just some words"));
    expect(result.current.error).toBe("demo.notALink");
    expect(result.current.canSkip).toBe(false);
    expect(mock.create).not.toHaveBeenCalled();

    act(() => result.current.submitTyped("   "));
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("saves a typed bare link, or the link inside typed text", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo();
    act(() => result.current.submitTyped("read this example.com/a"));
    expect(result.current.error).toBe("demo.notALink");
    expect(mock.create).not.toHaveBeenCalled();

    await flush(() =>
      result.current.submitTyped("read this https://example.com/b."),
    );
    expect(mock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "https://example.com/b" }),
    );
    expect(result.current.error).toBeNull();
  });

  it("saves a bare typed domain as written", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo();
    await flush(() => result.current.submitTyped(" example.com/a "));
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "example.com/a" }),
    );
  });

  it("advances once the item is ready", async () => {
    mock.create.mockResolvedValue(saved());
    const { result, rerender, onAdvance } = renderDemo();
    await flush(() => result.current.submitUrl("https://example.com/"));

    mock.query = {
      data: { status: "ready" },
      isError: false,
      isSuccess: true,
    };
    rerender();
    rerender();
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(captured("onboarding_demo_result")).toEqual([
      ["onboarding_demo_result", { outcome: "ready" }],
    ]);
  });

  it("shows a failed item, and a rate-limited retry says try later", async () => {
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo();
    await flush(() => result.current.submitUrl("https://example.com/"));

    mock.query = {
      data: { status: "failed" },
      isError: false,
      isSuccess: true,
    };
    rerender();
    expect(result.current.view).toBe("failed");
    expect(result.current.canAcceptShare()).toBe(false);
    expect(captured("onboarding_demo_result").at(-1)).toEqual([
      "onboarding_demo_result",
      { outcome: "failed" },
    ]);

    mock.retry.mockRejectedValue(new ConvexError({ kind: "RateLimited" }));
    await flush(() => void result.current.retry());
    expect(result.current.view).toBe("failed");
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBe("demo.tryLater");
  });

  it("reports a save that vanished and stops watching it on the next action", async () => {
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo();
    await flush(() => result.current.submitUrl("https://example.com/"));

    mock.query = { data: null, isError: false, isSuccess: true };
    rerender();
    expect(result.current.view).toBe("share");
    expect(result.current.error).toBe("demo.saveGone");
    expect(result.current.canSkip).toBe(true);
    expect(result.current.canAcceptShare()).toBe(true);

    act(() => result.current.setError(null));
    expect(mock.queryArgs).toBe("skip");
    expect(result.current.error).toBeNull();
    expect(result.current.canSkip).toBe(true);
  });

  it("flags a slow save after the deadline and re-arms on keep waiting", async () => {
    vi.useFakeTimers();
    try {
      mock.create.mockResolvedValue(saved());
      const { result } = renderDemo();
      await flush(() => result.current.submitUrl("https://example.com/"));
      expect(result.current.view).toBe("reading");

      act(() => vi.advanceTimersByTime(14_999));
      expect(result.current.timedOut).toBe(false);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.timedOut).toBe(true);

      act(() => result.current.keepWaiting());
      expect(result.current.timedOut).toBe(false);
      act(() => vi.advanceTimersByTime(15_000));
      expect(result.current.timedOut).toBe(true);

      act(() => result.current.continueAfterTimeout());
      expect(captured("onboarding_demo_result").at(-1)).toEqual([
        "onboarding_demo_result",
        { outcome: "timeout" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records the first share for an onboarding share-sheet save", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo(null, "user_1");
    await flush(() => result.current.submitSharedUrl("https://example.com/"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("keeps the how-to card for a pasted or typed demo save", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo(null, "user_1");
    await flush(() => result.current.submitUrl("https://example.com/"));
    await flush(() => result.current.submitTyped("https://example.com/b"));
    expect(mock.recordShareSaved).not.toHaveBeenCalled();
  });

  it("records the first share once sign-in unlocks a shared save", async () => {
    mock.authenticated = false;
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo(null, "user_1");

    act(() => result.current.submitSharedUrl("https://example.com/"));
    expect(result.current.view).toBe("auth");
    expect(mock.recordShareSaved).not.toHaveBeenCalled();

    mock.authenticated = true;
    rerender({ userId: "user_1" });
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("waits for the account id before recording a shared save", async () => {
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo(null, null);
    await flush(() => result.current.submitSharedUrl("https://example.com/"));
    expect(mock.recordShareSaved).not.toHaveBeenCalled();

    rerender({ userId: "user_1" });
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("records the first share for a save resumed after an app kill", async () => {
    // The relaunch has no memory of the share sheet beyond this record, so
    // the persisted viaShare bit is the only thing that can vouch for it.
    mock.create.mockResolvedValue(saved(true));
    const { result } = renderDemo(
      { url: "https://example.com/", destination: null, viaShare: true },
      "user_1",
    );
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("keeps the how-to card for a paste resumed after an app kill", async () => {
    mock.create.mockResolvedValue(saved(true));
    const { result } = renderDemo(
      { url: "https://example.com/", destination: null, viaShare: false },
      "user_1",
    );
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).not.toHaveBeenCalled();
  });

  it("persists the share origin so a relaunch can still record it", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo(null, "user_1");
    await flush(() => result.current.submitSharedUrl("https://example.com/"));
    for (const call of mock.setPendingDemo.mock.calls) {
      expect(call[0]).toMatchObject({ viaShare: true });
    }
    expect(mock.setPendingDemo).toHaveBeenCalledTimes(2);
  });

  it("persists a paste as not shared", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo(null, "user_1");
    await flush(() => result.current.submitUrl("https://example.com/"));
    for (const call of mock.setPendingDemo.mock.calls) {
      expect(call[0]).toMatchObject({ viaShare: false });
    }
  });

  it("returns to picking when sign-in is cancelled", () => {
    mock.authenticated = false;
    const { result } = renderDemo();
    act(() => result.current.submitUrl("https://example.com/"));
    act(() => result.current.cancelAuth());
    expect(result.current.view).toBe("share");
    expect(result.current.authUrl).toBe("");
    expect(mock.setPendingDemo).toHaveBeenLastCalledWith(null);
  });
});

describe("deriveDemoView", () => {
  const watching = {
    ...initialDemoSaveState(null),
    phase: "saved" as const,
    itemId: ITEM_ID as never,
  };

  it.each([
    [undefined, false, false, "reading", null],
    [{ status: "processing" as const }, false, true, "reading", null],
    [{ status: "ready" as const }, false, true, "reading", null],
    [{ status: "failed" as const }, false, true, "failed", null],
    [{ status: "failed" as const }, true, false, "failed", null],
    [undefined, true, false, "share", "demo.loadFailed"],
    [null, false, true, "share", "demo.saveGone"],
  ])(
    "item %o (error %s, success %s) shows %s",
    (item, isError, isSuccess, view, lostError) => {
      expect(deriveDemoView(watching, { item, isError, isSuccess })).toEqual({
        view,
        lostError,
      });
    },
  );

  it("shows the stored phase before anything is saved", () => {
    const query = { item: null, isError: true, isSuccess: false };
    expect(deriveDemoView(initialDemoSaveState(null), query).view).toBe(
      "share",
    );
    expect(
      deriveDemoView(
        initialDemoSaveState({
          url: "https://a.test",
          destination: null,
          viaShare: false,
        }),
        query,
      ).view,
    ).toBe("auth");
  });
});

describe("demoSaveReducer", () => {
  it("keeps the same state when clearing an absent error", () => {
    const state = initialDemoSaveState(null);
    expect(
      demoSaveReducer(state, { type: "setError", error: null, lost: false }),
    ).toBe(state);
  });

  it("returns a failed resume to picking", () => {
    const state = initialDemoSaveState({
      url: "https://a.test",
      destination: null,
      viaShare: false,
    });
    expect(
      demoSaveReducer(state, { type: "submitFailed", used: false }),
    ).toMatchObject({ phase: "share", saveFailed: true, submitting: false });
  });

  it("drops a lost save when a new link is submitted", () => {
    const lost = {
      ...initialDemoSaveState(null),
      phase: "saved" as const,
      itemId: ITEM_ID as never,
    };
    expect(
      demoSaveReducer(lost, {
        type: "submit",
        request: { url: "https://b.test", destination: null, viaShare: false },
        authenticated: true,
        lost: true,
      }),
    ).toMatchObject({
      phase: "share",
      itemId: null,
      submitting: true,
      savingUrl: "https://b.test",
    });
  });
});

describe("linkFromText", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["  example.com/a  ", "example.com/a"],
    ["see https://example.com/a.", "https://example.com/a"],
    ["not a link", null],
    ["", null],
  ])("%j -> %j", (text, expected) => {
    expect(linkFromText(text)).toBe(expected);
  });
});

describe("retryErrorKey", () => {
  it.each([
    [demoError("terminal_failure"), "demo.notFoundRetry"],
    [demoError("too_many_retries"), "demo.repeatedFailure"],
    [new ConvexError({ kind: "RateLimited" }), "demo.tryLater"],
    [new Error("boom"), "demo.retryFailed"],
  ])("maps %o", (err, key) => {
    expect(retryErrorKey(err)).toBe(key);
  });
});

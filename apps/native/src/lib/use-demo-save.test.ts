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
  consentBlocked: false,
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
  releaseSavedShare: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
  useMutation: (ref: string) => (ref === "create" ? mock.create : mock.retry),
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ savesBlocked: mock.consentBlocked }),
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
    url === "https://sample.test/recipe" ||
    url === "https://sample.test/ready-made"
      ? "recipes"
      : null,
  isDemoSample: (url: string) => url === "https://sample.test/ready-made",
}));
vi.mock("@/lib/first-share", () => ({
  recordShareSaved: mock.recordShareSaved,
}));
vi.mock("@/lib/use-incoming-share-url", () => ({
  releaseSavedShare: mock.releaseSavedShare,
}));

const ITEM_ID = "item-1";
const saved = (reused = false) => ({
  itemId: ITEM_ID,
  userId: "user_1",
  url: "https://example.com/",
  urlMatchesRequest: true,
  reused,
  savedSpaceNames: [],
});

function renderDemo(
  resume: {
    url: string;
    destination: null;
    source: "direct" | "share";
  } | null = null,
) {
  const onSaved = vi.fn();
  const onAdvance = vi.fn();
  const hook = renderHook(() =>
    useDemoSave({ spaces: ["recipes"], resume, onSaved, onAdvance }),
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
  mock.consentBlocked = false;
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
      source: "direct",
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
      source: "direct",
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
    // Saving after sign-in resumes the pick; it is not a second one.
    expect(captured("onboarding_demo_picked")).toHaveLength(1);

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
    const { result, onSaved } = renderDemo();
    await flush(() => result.current.submitSharedUrl("https://example.com/"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
    expect(mock.recordShareSaved.mock.invocationCallOrder[0]).toBeLessThan(
      onSaved.mock.invocationCallOrder[0],
    );
  });

  it("lets go of a shared link only when the server saved that link", async () => {
    mock.releaseSavedShare.mockReset();
    // The demo save was already spent: the server hands back the old item.
    mock.create.mockResolvedValue({
      ...saved(),
      reused: true,
      urlMatchesRequest: false,
    });
    const spent = renderDemo();
    await flush(() =>
      spent.result.current.submitSharedUrl("https://mine.test/new"),
    );
    expect(mock.releaseSavedShare).not.toHaveBeenCalled();
    spent.unmount();

    mock.create.mockResolvedValue(saved());
    const fresh = renderDemo();
    await flush(() =>
      fresh.result.current.submitSharedUrl("https://mine.test/new"),
    );
    expect(mock.releaseSavedShare).toHaveBeenCalledWith(
      "https://mine.test/new",
    );
  });

  it("keeps an in-flight share's origin when a typed submit is rejected", async () => {
    let resolveSave!: (value: ReturnType<typeof saved>) => void;
    mock.create.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result } = renderDemo();

    act(() => result.current.submitSharedUrl("https://example.com/shared"));
    act(() => result.current.submitTyped("https://example.com/typed"));
    expect(mock.create).toHaveBeenCalledTimes(1);

    await act(async () => resolveSave(saved()));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("keeps the how-to card for a pasted or typed demo save", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo();
    await flush(() => result.current.submitUrl("https://example.com/"));
    await flush(() => result.current.submitTyped("https://example.com/b"));
    expect(mock.recordShareSaved).not.toHaveBeenCalled();
  });

  it("persists share origin until sign-in unlocks the save", async () => {
    mock.authenticated = false;
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo();

    act(() => result.current.submitSharedUrl("https://example.com/"));
    expect(result.current.view).toBe("auth");
    expect(mock.setPendingDemo).toHaveBeenCalledWith({
      url: "https://example.com/",
      destination: null,
      source: "share",
    });
    expect(mock.recordShareSaved).not.toHaveBeenCalled();

    mock.authenticated = true;
    rerender();
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("holds a signed-in save until the AI consent answer, then sends it once", async () => {
    mock.consentBlocked = true;
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo();

    await flush(() => result.current.submitUrl("https://example.com/"));
    expect(result.current.view).toBe("auth");
    expect(mock.create).not.toHaveBeenCalled();

    mock.consentBlocked = false;
    rerender();
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/" }),
    );
  });

  it("does not send a save resumed after sign-in while the answer is missing", async () => {
    mock.authenticated = false;
    mock.consentBlocked = true;
    mock.create.mockResolvedValue(saved());
    const { result, rerender } = renderDemo();
    act(() => result.current.submitUrl("https://example.com/"));

    mock.authenticated = true;
    rerender();
    await flush(() => {});
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("records a resumed share on a fresh mount, including a reused save", async () => {
    mock.create.mockResolvedValue(saved(true));
    const { result } = renderDemo({
      url: "https://example.com/",
      destination: null,
      source: "share",
    });
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user_1");
  });

  it("does not record a reused item for a different shared URL", async () => {
    mock.create.mockResolvedValue({
      ...saved(true),
      urlMatchesRequest: false,
    });
    const { result } = renderDemo({
      url: "https://example.com/different",
      destination: null,
      source: "share",
    });
    await waitFor(() => expect(result.current.view).toBe("reading"));
    expect(mock.recordShareSaved).not.toHaveBeenCalled();
    expect(mock.setPendingDemo).toHaveBeenLastCalledWith({
      url: "https://example.com/",
      destination: null,
      source: "direct",
    });
  });

  it("previews a ready-made sample when signed out, without saving", () => {
    mock.authenticated = false;
    const { result, rerender, onAdvance } = renderDemo();

    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    expect(result.current.view).toBe("preview");
    expect(result.current.savingUrl).toBe("https://sample.test/ready-made");
    expect(mock.setPendingDemo).toHaveBeenCalledWith({
      url: "https://sample.test/ready-made",
      destination: "name:recipes",
      source: "direct",
    });
    expect(captured("onboarding_demo_picked")).toEqual([
      ["onboarding_demo_picked", { sample: true, signed_in: false }],
    ]);

    expect(mock.create).not.toHaveBeenCalled();

    // The preview's step timer depends on this staying the same.
    const previewed = result.current.previewed;
    rerender();
    expect(result.current.previewed).toBe(previewed);

    // The preview ends on the sign-in ask, with the same request.
    act(() => result.current.previewed());
    expect(result.current.view).toBe("auth");
    expect(result.current.authRequest?.url).toBe(
      "https://sample.test/ready-made",
    );
    expect(onAdvance).not.toHaveBeenCalled();
    rerender();
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("retries a previewed sample whose save failed after sign-in, without restarting", async () => {
    mock.authenticated = false;
    const { result, rerender, onSaved } = renderDemo();
    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    act(() => result.current.previewed());

    let reject!: (err: unknown) => void;
    mock.create.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    mock.authenticated = true;
    rerender();
    // Signed in: the preview already played the reading steps, so the
    // sign-in ask stays up while the save is on its way.
    expect(result.current.view).toBe("auth");
    await flush(() => reject(new Error("network")));
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(result.current.view).toBe("share");
    expect(result.current.error).toBe("demo.saveFailed");
    expect(captured("onboarding_demo_result")).toEqual([
      ["onboarding_demo_result", { outcome: "error" }],
    ]);

    mock.create.mockResolvedValueOnce(saved());
    await flush(() =>
      result.current.submitUrl("https://sample.test/ready-made"),
    );
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(result.current.view).toBe("reading");
    expect(onSaved).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      savedSpaceNames: [],
    });
  });

  it("keeps a previewed sample's sign-in screen up until the item is read, then moves on", async () => {
    mock.authenticated = false;
    const { result, rerender, onAdvance, onSaved } = renderDemo();
    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    act(() => result.current.previewed());

    const views: string[] = [];
    let resolve!: (value: ReturnType<typeof saved>) => void;
    mock.create.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mock.authenticated = true;
    rerender();
    views.push(result.current.view);
    expect(result.current.authRequest?.url).toBe(
      "https://sample.test/ready-made",
    );
    expect(onAdvance).not.toHaveBeenCalled();

    await flush(() => resolve(saved()));
    views.push(result.current.view);
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      savedSpaceNames: [],
    });
    // Still being read: leaving now would drop the retry a failure needs.
    expect(onAdvance).not.toHaveBeenCalled();
    // The demo save is spent, so a share arriving now is held, not consumed.
    expect(result.current.view).toBe("auth");
    expect(result.current.canAcceptShare()).toBe(false);

    mock.query = {
      data: { status: "ready" },
      isError: false,
      isSuccess: true,
    };
    rerender();
    views.push(result.current.view);
    expect(views).toEqual(["auth", "auth", "auth"]);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("leaves the sign-in screen for good once a previewed sample's read is slow", async () => {
    vi.useFakeTimers();
    try {
      mock.authenticated = false;
      const { result, rerender } = renderDemo();
      act(() => result.current.submitUrl("https://sample.test/ready-made"));
      act(() => result.current.previewed());
      mock.create.mockResolvedValueOnce(saved());
      mock.authenticated = true;
      rerender();
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.view).toBe("auth");

      act(() => vi.advanceTimersByTime(15_000));
      expect(result.current.view).toBe("reading");
      act(() => result.current.keepWaiting());
      expect(result.current.view).toBe("reading");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the retry when a previewed sample fails after sign-in", async () => {
    mock.authenticated = false;
    const { result, rerender, onAdvance } = renderDemo();
    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    act(() => result.current.previewed());
    mock.create.mockResolvedValueOnce(saved());
    mock.authenticated = true;
    await flush(() => rerender());

    mock.query = {
      data: { status: "failed" },
      isError: false,
      isSuccess: true,
    };
    rerender();
    expect(result.current.view).toBe("failed");
    expect(onAdvance).not.toHaveBeenCalled();

    // Retrying watches the item on the reading view, not the sign-in screen.
    mock.retry.mockResolvedValueOnce(null);
    await flush(() => void result.current.retry());
    mock.query = {
      data: { status: "processing" },
      isError: false,
      isSuccess: true,
    };
    rerender();
    expect(result.current.view).toBe("reading");
  });

  it("returns to the sign-in ask without a replay when a previewed sample is picked again after going back", () => {
    mock.authenticated = false;
    const { result } = renderDemo();
    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    act(() => result.current.previewed());
    act(() => result.current.cancelAuth());
    expect(result.current.view).toBe("share");

    act(() => result.current.submitUrl("https://sample.test/ready-made"));
    expect(result.current.view).toBe("auth");
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("restores a sample picked before a relaunch to the same sign-in ask", async () => {
    mock.authenticated = false;
    const request = {
      url: "https://sample.test/ready-made",
      destination: null,
      source: "direct" as const,
    };
    // Killed during the preview: only the request was persisted.
    const { result, rerender } = renderDemo(request);
    expect(result.current.view).toBe("auth");
    expect(result.current.authRequest).toEqual(request);
    expect(mock.create).not.toHaveBeenCalled();

    // A fresh run reaches the same state once its preview ends.
    const fresh = renderDemo();
    act(() => fresh.result.current.submitUrl(request.url));
    act(() => fresh.result.current.previewed());
    expect(fresh.result.current.view).toBe(result.current.view);

    mock.create.mockResolvedValue(saved());
    mock.authenticated = true;
    await flush(() => rerender());
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: request.url }),
    );
  });

  it("saves a ready-made sample at once when already signed in", async () => {
    mock.create.mockResolvedValue(saved());
    const { result } = renderDemo();
    await flush(() =>
      result.current.submitUrl("https://sample.test/ready-made"),
    );
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(captured("onboarding_demo_picked")).toEqual([
      ["onboarding_demo_picked", { sample: true, signed_in: true }],
    ]);
  });

  it("still asks for sign-in first for a pasted link", () => {
    mock.authenticated = false;
    const { result } = renderDemo();
    act(() => result.current.submitUrl("https://example.com/"));
    expect(result.current.view).toBe("auth");
    expect(captured("onboarding_demo_picked")).toEqual([
      ["onboarding_demo_picked", { sample: false, signed_in: false }],
    ]);
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
          source: "direct",
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
      source: "direct",
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
        request: {
          url: "https://b.test",
          destination: null,
          source: "direct",
        },
        authenticated: true,
        preview: false,
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

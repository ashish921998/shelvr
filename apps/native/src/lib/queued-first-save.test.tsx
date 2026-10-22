// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  keychainFailing: false,
  authenticated: true,
  onboarded: true,
  savesBlocked: false,
  user: { _id: "user-1" } as { _id: string } | null,
  createDemoItem: vi.fn(),
  queueDemoUrl: vi.fn(),
  recordShareSaved: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (mock.keychainFailing) throw new Error("keychain unavailable");
    mock.store.set(key, value);
  },
}));
vi.mock("@convex/_generated/api", () => ({
  api: { demo: { createDemoItem: "createDemoItem" } },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
  useMutation: () => mock.createDemoItem,
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ savesBlocked: mock.savesBlocked }),
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user }),
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mock.onboarded }),
}));
vi.mock("@/lib/onboarding-demo", () => ({
  findSample: (url: string) =>
    url === "https://sample.test/ready-made"
      ? { pageHeading: "Ready-made heading" }
      : undefined,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  queueDemoUrl: mock.queueDemoUrl,
}));
vi.mock("@/lib/first-share", () => ({
  recordShareSaved: mock.recordShareSaved,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: mock.capture,
    captureError: mock.captureError,
    sessionId: () => "session",
  },
}));

const { getQueuedFirstSaveUrl, useQueuedFirstSave } =
  await import("./queued-first-save");

/** Only an older build's onboarding queues a first save, so seed the keychain the way it left it. */
function queueFirstSave(save: {
  url: string;
  destination: string | null;
  source: "direct" | "share";
}) {
  mock.store.set(
    "shelvr.onboarding.queuedSave",
    JSON.stringify({ ...save, owner: null }),
  );
}

const SAMPLE = "https://sample.test/ready-made";
const result = (overrides: object = {}) => ({
  itemId: "item-1",
  userId: "user-1",
  url: SAMPLE,
  urlMatchesRequest: true,
  reused: false,
  savedSpaceNames: ["Recipes"],
  ...overrides,
});

async function mount() {
  const hook = renderHook(() => useQueuedFirstSave());
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  mock.store.clear();
  mock.keychainFailing = false;
  mock.authenticated = true;
  mock.onboarded = true;
  mock.savesBlocked = false;
  mock.user = { _id: "user-1" };
  mock.createDemoItem.mockReset().mockResolvedValue(result());
  mock.queueDemoUrl.mockReset();
  mock.recordShareSaved.mockReset();
  mock.capture.mockReset();
  mock.captureError.mockReset();
});

describe("a first save queued before sign-in", () => {
  it("lands as the account's free demo save, filed and titled as picked", async () => {
    queueFirstSave({ url: SAMPLE, destination: "Recipes", source: "direct" });
    await mount();
    expect(mock.createDemoItem).toHaveBeenCalledWith({
      url: SAMPLE,
      title: "Ready-made heading",
      spaceName: "Recipes",
      analyticsSessionId: "session",
    });
    expect(getQueuedFirstSaveUrl()).toBeNull();
    expect(mock.queueDemoUrl).not.toHaveBeenCalled();
    expect(mock.capture).toHaveBeenCalledWith("onboarding_demo_submitted");
  });

  it("waits for sign-in, the end of onboarding and the AI answer", async () => {
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    mock.authenticated = false;
    const hook = await mount();
    mock.authenticated = true;
    mock.onboarded = false;
    hook.rerender();
    mock.onboarded = true;
    mock.savesBlocked = true;
    hook.rerender();
    expect(mock.createDemoItem).not.toHaveBeenCalled();

    mock.savesBlocked = false;
    hook.rerender();
    await act(async () => {});
    expect(mock.createDemoItem).toHaveBeenCalledOnce();
    expect(mock.createDemoItem.mock.calls[0]![0].spaceName).toBeUndefined();
  });

  it("hands the link and its space to the Pro replay when the account's demo save is spent", async () => {
    mock.createDemoItem.mockResolvedValue(
      result({ reused: true, urlMatchesRequest: false, url: "https://old" }),
    );
    queueFirstSave({ url: SAMPLE, destination: "Recipes", source: "direct" });
    await mount();
    expect(mock.queueDemoUrl).toHaveBeenCalledWith(SAMPLE, "Recipes", "user-1");
    expect(getQueuedFirstSaveUrl()).toBeNull();
  });

  it("records a shared link as the account's first share", async () => {
    queueFirstSave({ url: SAMPLE, destination: null, source: "share" });
    await mount();
    expect(mock.recordShareSaved).toHaveBeenCalledWith("user-1");
  });

  it("hands a link the server refuses to the replay, and keeps one a lost connection dropped", async () => {
    mock.createDemoItem.mockRejectedValue(new ConvexError({ code: "demo" }));
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    await mount();
    expect(mock.queueDemoUrl).toHaveBeenCalledWith(SAMPLE, null, "user-1");
    expect(getQueuedFirstSaveUrl()).toBeNull();

    mock.createDemoItem.mockRejectedValue(new Error("offline"));
    mock.queueDemoUrl.mockReset();
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    await mount();
    expect(mock.queueDemoUrl).not.toHaveBeenCalled();
    expect(getQueuedFirstSaveUrl()).toBe(SAMPLE);
  });

  it("never saves another account's queued save into the next account", async () => {
    mock.createDemoItem.mockRejectedValue(new Error("offline"));
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    await mount();
    expect(getQueuedFirstSaveUrl()).toBe(SAMPLE);

    mock.createDemoItem.mockReset().mockResolvedValue(result());
    mock.user = { _id: "user-2" };
    await mount();
    expect(mock.createDemoItem).not.toHaveBeenCalled();
    expect(mock.queueDemoUrl).not.toHaveBeenCalled();
    expect(getQueuedFirstSaveUrl()).toBeNull();
  });

  it("retries its own queued save on the next launch", async () => {
    mock.createDemoItem.mockRejectedValue(new Error("offline"));
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    await mount();

    mock.createDemoItem.mockReset().mockResolvedValue(result());
    await mount();
    expect(mock.createDemoItem).toHaveBeenCalledOnce();
    expect(getQueuedFirstSaveUrl()).toBeNull();
  });

  it("waits for the account before claiming the save", async () => {
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    mock.user = null;
    const hook = await mount();
    expect(mock.createDemoItem).not.toHaveBeenCalled();

    mock.user = { _id: "user-1" };
    hook.rerender();
    await act(async () => {});
    expect(mock.createDemoItem).toHaveBeenCalledOnce();
  });

  it("reports a keychain that will not take the claim and leaves the save queued", async () => {
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    mock.keychainFailing = true;
    await mount();
    expect(mock.captureError).toHaveBeenCalledWith(
      "claim_queued_first_save_failed",
      expect.any(Error),
    );
    expect(mock.createDemoItem).not.toHaveBeenCalled();
    expect(getQueuedFirstSaveUrl()).toBe(SAMPLE);
  });

  it("keeps the queued save when the server is only rate limiting", async () => {
    mock.createDemoItem.mockRejectedValue(
      new ConvexError({ kind: "RateLimited", name: "demo", retryAfter: 1 }),
    );
    queueFirstSave({ url: SAMPLE, destination: null, source: "direct" });
    await mount();
    expect(mock.queueDemoUrl).not.toHaveBeenCalled();
    expect(getQueuedFirstSaveUrl()).toBe(SAMPLE);
  });

  it("does nothing when nothing was queued", async () => {
    await mount();
    expect(mock.createDemoItem).not.toHaveBeenCalled();
  });
});

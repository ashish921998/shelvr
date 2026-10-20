// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPendingDemoUrl,
  getPendingSpaces,
  hasPending,
  queueDemoUrl,
  setPendingSpaces,
} from "./pending-onboarding";
import {
  clearPurchaseBeforeSignIn,
  notePurchaseBeforeSignIn,
} from "./purchase-before-sign-in";
import { useReplayOnboarding } from "./replay-onboarding";

const storage = vi.hoisted(() => new Map<string, string>());
const createSpace = vi.hoisted(() => vi.fn());
const createLinkItem = vi.hoisted(() => vi.fn());
const entitlement = vi.hoisted(() => ({ entitled: true, loading: false }));
const openPaywall = vi.hoisted(() => vi.fn());

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    spaces: { createSpace: "createSpace" },
    items: { createLinkItem: "createLinkItem" },
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: (ref: string) =>
    ref === "createSpace" ? createSpace : createLinkItem,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/analytics", () => ({ analytics: { sessionId: () => "s" } }));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: true }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ ...entitlement }),
  openPaywall,
  waitForSheetTransition: () => Promise.resolve(),
}));

// Lets every pending mutation promise, store notification and re-render
// settle. A self-retrying replay keeps scheduling new attempts, so the call
// count below would keep growing instead of holding still.
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// Rejects like a server error, but succeeds once the call count shows a retry
// loop, so a regression fails its assertion instead of exhausting the heap.
function failingServer() {
  return () =>
    createSpace.mock.calls.length > 20
      ? Promise.resolve("space")
      : Promise.reject(new Error("server error"));
}

beforeEach(() => {
  storage.clear();
  createSpace.mockReset();
  createLinkItem.mockReset();
  openPaywall.mockReset().mockResolvedValue(false);
  entitlement.entitled = true;
});

describe("useReplayOnboarding retries", () => {
  it("does not retry failed spaces just because it saved the failure", async () => {
    createSpace.mockImplementation(failingServer());
    setPendingSpaces(["Recipes", "Trips"]);

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(getPendingSpaces()).toEqual(["Recipes", "Trips"]);
  });

  it("keeps only the failed space after a partial success, without retrying it", async () => {
    createSpace.mockImplementation(({ name }: { name: string }) =>
      name === "Trips" ? failingServer()() : Promise.resolve("space"),
    );
    setPendingSpaces(["Recipes", "Trips"]);

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(getPendingSpaces()).toEqual(["Trips"]);
  });

  it("retries failed work on the next mount", async () => {
    createSpace.mockImplementation(failingServer());
    setPendingSpaces(["Trips"]);
    const first = renderHook(() => useReplayOnboarding());
    await settle();
    first.unmount();

    createSpace.mockResolvedValue("space");
    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("retries failed work after the entitlement comes back", async () => {
    createSpace.mockImplementation(failingServer());
    setPendingSpaces(["Trips"]);
    const hook = renderHook(() => useReplayOnboarding());
    await settle();

    entitlement.entitled = false;
    hook.rerender();
    await settle();
    createSpace.mockResolvedValue("space");
    entitlement.entitled = true;
    hook.rerender();
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("retries when the entitlement changes while a pass is in flight", async () => {
    let failFirst: (error: Error) => void = () => {};
    createSpace.mockImplementationOnce(
      () => new Promise((_, reject) => (failFirst = reject)),
    );
    setPendingSpaces(["Trips"]);
    const hook = renderHook(() => useReplayOnboarding());
    await settle();

    entitlement.entitled = false;
    hook.rerender();
    entitlement.entitled = true;
    hook.rerender();
    createSpace.mockResolvedValue("space");
    await act(async () => failFirst(new Error("server error")));
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("runs a new submission of the same spaces", async () => {
    createSpace.mockImplementation(failingServer());
    setPendingSpaces(["Trips"]);
    renderHook(() => useReplayOnboarding());
    await settle();

    createSpace.mockResolvedValue("space");
    act(() => setPendingSpaces(["Trips"]));
    await settle();

    expect(createSpace).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("runs work that arrives while a pass is in flight", async () => {
    // An older build's queued link keeps the replay busy after the spaces.
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "op",
        spaces: ["Trips"],
        demoUrl: "https://example.com/a",
      }),
    );
    createSpace.mockImplementation(failingServer());
    let failLink: (error: Error) => void = () => {};
    createLinkItem.mockImplementationOnce(
      () => new Promise((_, reject) => (failLink = reject)),
    );
    renderHook(() => useReplayOnboarding());
    await settle();

    createSpace.mockResolvedValue("space");
    await act(async () => {
      setPendingSpaces(["Books"]);
      failLink(new Error("server error"));
    });
    await settle();

    expect(createSpace).toHaveBeenLastCalledWith({
      name: "Books",
      dynamic: true,
    });
  });

  it("runs new pending work without a remount", async () => {
    createSpace.mockImplementation(failingServer());
    setPendingSpaces(["Trips"]);
    renderHook(() => useReplayOnboarding());
    await settle();

    createSpace.mockResolvedValue("space");
    act(() => setPendingSpaces(["Books"]));
    await settle();

    expect(createSpace).toHaveBeenLastCalledWith({
      name: "Books",
      dynamic: true,
    });
    expect(hasPending()).toBe(false);
  });
});

describe("a purchase made before sign-in", () => {
  it("waits for the purchase to reach the account instead of selling again, then saves the queued link", async () => {
    entitlement.entitled = false;
    createSpace.mockResolvedValue("space");
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe");
    setPendingSpaces(["Recipes"]);
    notePurchaseBeforeSignIn();

    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();
    expect(createSpace).not.toHaveBeenCalled();
    expect(getPendingDemoUrl()).toBe("https://example.com/recipe");

    clearPurchaseBeforeSignIn();
    entitlement.entitled = true;
    hook.rerender();
    await settle();

    expect(createSpace).toHaveBeenCalledWith({
      name: "Recipes",
      dynamic: true,
    });
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/recipe" }),
    );
    expect(hasPending()).toBe(false);
  });

  it("keeps waiting across a relaunch, then saves as soon as access shows", async () => {
    entitlement.entitled = false;
    createSpace.mockResolvedValue("space");
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe");
    setPendingSpaces(["Recipes"]);
    notePurchaseBeforeSignIn();

    // The app is closed before the purchase reaches the account.
    const first = renderHook(() => useReplayOnboarding());
    await settle();
    first.unmount();
    const relaunched = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();
    expect(createSpace).not.toHaveBeenCalled();

    // Access lands (the webhook, or the attach on this launch) while the
    // flag is still set: the replay does not wait for the flag too.
    entitlement.entitled = true;
    relaunched.rerender();
    await settle();
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/recipe" }),
    );
    expect(createLinkItem).toHaveBeenCalledOnce();
    expect(openPaywall).not.toHaveBeenCalled();
    clearPurchaseBeforeSignIn();
  });

  it("offers the paywall once the flag clears with no purchase found", async () => {
    entitlement.entitled = false;
    setPendingSpaces(["Recipes"]);
    notePurchaseBeforeSignIn();
    renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();

    act(() => clearPurchaseBeforeSignIn());
    await settle();

    expect(openPaywall).toHaveBeenCalledOnce();
  });
});

describe("a link handed to the replay while it runs", () => {
  it("is saved by a fresh pass instead of cleared with the spaces", async () => {
    let finishSpace: (id: string) => void = () => {};
    createSpace.mockImplementationOnce(
      () => new Promise((resolve) => (finishSpace = resolve)),
    );
    createLinkItem.mockResolvedValue("item");
    setPendingSpaces(["Recipes"]);
    renderHook(() => useReplayOnboarding());
    await settle();

    await act(async () => {
      queueDemoUrl("https://example.com/late");
      finishSpace("space");
    });
    await settle();

    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/late" }),
    );
    expect(hasPending()).toBe(false);
  });

  it("is saved, in the space it was picked for, when it arrives after the replay finished", async () => {
    createSpace.mockImplementation(({ name }: { name: string }) =>
      Promise.resolve(`space:${name}`),
    );
    createLinkItem.mockResolvedValue("item");
    setPendingSpaces(["Recipes"]);
    renderHook(() => useReplayOnboarding());
    await settle();
    expect(hasPending()).toBe(false);

    act(() => queueDemoUrl("https://example.com/after", "Recipes"));
    await settle();

    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/after",
        spaceId: "space:Recipes",
      }),
    );
    expect(hasPending()).toBe(false);
  });
});

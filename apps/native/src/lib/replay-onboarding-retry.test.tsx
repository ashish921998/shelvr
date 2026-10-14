// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPendingSpaces,
  hasPending,
  setPendingSpaces,
} from "./pending-onboarding";
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

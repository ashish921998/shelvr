// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPendingDemoUrl,
  hasPending,
  queueDemoUrl,
  setPendingSpaces,
} from "./pending-onboarding";
import {
  clearPurchaseBeforeSignIn,
  notePurchaseBeforeSignIn,
} from "./purchase-before-sign-in";
import { useReplayOnboarding } from "./replay-onboarding";
import { ahaSample } from "./aha-sample";

const storage = vi.hoisted(() => new Map<string, string>());
const createSpace = vi.hoisted(() => vi.fn());
const createLinkItem = vi.hoisted(() => vi.fn());
const entitlement = vi.hoisted(() => ({ entitled: true, loading: false }));
const openPaywall = vi.hoisted(() => vi.fn());
const account = vi.hoisted(() => ({
  user: { _id: "user_1" } as object | undefined,
}));

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
// Stable like the real router: a new object each render would re-run the replay effect.
const stableRouter = vi.hoisted(() => ({}));
vi.mock("expo-router", () => ({ useRouter: () => stableRouter }));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: account.user }),
}));
const captureError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({
  analytics: { sessionId: () => "s", captureError },
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: true }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ ...entitlement }),
  openPaywallOutcome: async (...args: unknown[]) => {
    const result: unknown = await openPaywall(...args);
    if (result === true) return "success";
    return result === false ? "cancelled" : result;
  },
  waitForSheetTransition: () => Promise.resolve(),
}));

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function failingServer() {
  return () =>
    createLinkItem.mock.calls.length > 20
      ? Promise.resolve("space")
      : Promise.reject(new Error("server error"));
}

beforeEach(() => {
  storage.clear();
  createSpace.mockReset();
  createLinkItem.mockReset();
  captureError.mockReset();
  openPaywall.mockReset().mockResolvedValue(false);
  entitlement.entitled = true;
  account.user = { _id: "user_1" };
});

describe("a no to the replay's paywall", () => {
  const reel = ahaSample("trip", null).firstSaveUrl;

  async function coldLaunch() {
    vi.resetModules();
    const fresh = await import("./replay-onboarding");
    const hook = renderHook(() => fresh.useReplayOnboarding());
    await settle();
    return hook;
  }

  it("asks once for the queued work, in the same launch and after a cold launch", async () => {
    entitlement.entitled = false;
    queueDemoUrl(reel);
    const first = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).toHaveBeenCalledOnce();
    act(() => queueDemoUrl(reel));
    await settle();
    expect(openPaywall).toHaveBeenCalledOnce();
    first.unmount();
    await coldLaunch();
    expect(openPaywall).toHaveBeenCalledOnce();
    expect(getPendingDemoUrl()).toBe(reel);
  });

  it("still saves the queued reel once access arrives after a no", async () => {
    entitlement.entitled = false;
    queueDemoUrl(reel);
    createLinkItem.mockResolvedValue("item");
    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).toHaveBeenCalledOnce();
    entitlement.entitled = true;
    hook.rerender();
    await settle();
    expect(createLinkItem).toHaveBeenCalledOnce();
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: reel }),
    );
    expect(hasPending()).toBe(false);
  });

  it("asks again when the paywall could not open, since that is not a no", async () => {
    entitlement.entitled = false;
    openPaywall.mockResolvedValueOnce("unavailable");
    queueDemoUrl(reel);
    renderHook(() => useReplayOnboarding());
    await settle();
    act(() => queueDemoUrl(reel));
    await settle();
    expect(openPaywall).toHaveBeenCalledTimes(2);
  });

  it("asks once about new queued work after a no", async () => {
    entitlement.entitled = false;
    queueDemoUrl(reel);
    renderHook(() => useReplayOnboarding());
    await settle();
    act(() => queueDemoUrl("https://www.instagram.com/reel/other/"));
    await settle();
    expect(openPaywall).toHaveBeenCalledTimes(2);
  });
});

describe("useReplayOnboarding and the account", () => {
  it("keeps the sample reel queued until the signed-in account has Pro", async () => {
    const sample = ahaSample("trip", null);
    entitlement.entitled = false;
    queueDemoUrl(sample.firstSaveUrl);
    createLinkItem.mockResolvedValue("item");
    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(createLinkItem).not.toHaveBeenCalled();
    expect(getPendingDemoUrl()).toBe(sample.firstSaveUrl);
    entitlement.entitled = true;
    hook.rerender();
    await settle();
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        url: sample.firstSaveUrl,
        saveSource: "onboarding_demo",
      }),
    );
    expect(createLinkItem).toHaveBeenCalledOnce();
  });

  it("spends a free save on the sample reel without a paywall", async () => {
    const sample = ahaSample("trip", null);
    entitlement.entitled = false;
    queueDemoUrl(sample.firstSaveUrl);
    createLinkItem.mockResolvedValue("item");
    renderHook(() => useReplayOnboarding({ left: true, loading: false }));
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();
    expect(createLinkItem).toHaveBeenCalledOnce();
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: sample.firstSaveUrl }),
    );
  });

  it("waits for the free count before asking a free account to pay", async () => {
    entitlement.entitled = false;
    queueDemoUrl(ahaSample("trip", null).firstSaveUrl);
    renderHook(() => useReplayOnboarding({ left: false, loading: true }));
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();
    expect(createLinkItem).not.toHaveBeenCalled();
  });

  it.each(["date", "trip", "weekend"] as const)(
    "saves the fallback %s reel after the account becomes available, once",
    async (kind) => {
      const sample = ahaSample(kind, null);
      queueDemoUrl(sample.firstSaveUrl);
      createLinkItem.mockResolvedValue("item");
      account.user = undefined;
      const { rerender } = renderHook(() => useReplayOnboarding());
      await settle();
      expect(createLinkItem).not.toHaveBeenCalled();
      expect(getPendingDemoUrl()).toBe(sample.firstSaveUrl);

      account.user = { _id: "user_1" };
      rerender();
      await settle();
      expect(createLinkItem).toHaveBeenCalledWith(
        expect.objectContaining({
          url: sample.firstSaveUrl,
          operationId: expect.any(String),
          saveSource: "onboarding_demo",
        }),
      );
      expect(hasPending()).toBe(false);
      rerender();
      await settle();
      expect(createLinkItem).toHaveBeenCalledTimes(1);
    },
  );

  it("never saves a link handed over for another account", async () => {
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe", null, "user_other");
    setPendingSpaces([]);

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createLinkItem).not.toHaveBeenCalled();
    expect(getPendingDemoUrl()).toBeNull();
  });

  it("saves a link handed over for this account", async () => {
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe", null, "user_1");
    setPendingSpaces([]);

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/recipe",
        saveSource: "onboarding_demo",
      }),
    );
    expect(hasPending()).toBe(false);
  });

  it("reports a handed-over link that fails to save and keeps it queued", async () => {
    createLinkItem.mockRejectedValue(new Error("server error"));
    queueDemoUrl("https://example.com/recipe", null, "user_1");
    setPendingSpaces([]);

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(captureError).toHaveBeenCalledWith(
      "onboarding_demo_save_failed",
      expect.any(Error),
    );
    expect(hasPending()).toBe(true);
  });

  it("stops a run when another account signs in while it waits on the server", async () => {
    let finishSpace: (id: string) => void = () => {};
    createSpace.mockImplementationOnce(
      () => new Promise((resolve) => (finishSpace = resolve)),
    );
    createSpace.mockResolvedValue("space");
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe", "Articles", "user_1");

    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(createSpace).toHaveBeenCalledOnce();

    account.user = { _id: "user_2" };
    hook.rerender();
    await act(async () => finishSpace("space"));
    await settle();

    expect(createLinkItem).not.toHaveBeenCalled();
    expect(getPendingDemoUrl()).toBeNull();
  });

  it("clears a link that saved while another account signed in, so that account does not save it again", async () => {
    let finishSave: (id: string) => void = () => {};
    createLinkItem.mockImplementationOnce(
      () => new Promise((resolve) => (finishSave = resolve)),
    );
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe", null);

    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(createLinkItem).toHaveBeenCalledOnce();

    account.user = { _id: "user_2" };
    hook.rerender();
    await act(async () => finishSave("item"));
    await settle();
    hook.rerender();
    await settle();

    expect(getPendingDemoUrl()).toBeNull();
    expect(createLinkItem).toHaveBeenCalledOnce();
  });

  it("writes nothing more once it unmounts mid-run", async () => {
    let finishSpace: (id: string) => void = () => {};
    createSpace.mockImplementationOnce(
      () => new Promise((resolve) => (finishSpace = resolve)),
    );
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/recipe", "Articles", "user_1");

    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    hook.unmount();
    await act(async () => finishSpace("space"));
    await settle();

    expect(createSpace).toHaveBeenCalledOnce();
    expect(createLinkItem).not.toHaveBeenCalled();
    expect(getPendingDemoUrl()).toBe("https://example.com/recipe");
  });

  it("waits for the account before asking for the paywall", async () => {
    entitlement.entitled = false;
    account.user = undefined;
    setPendingSpaces(["Articles"]);
    const hook = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();

    account.user = { _id: "user_1" };
    hook.rerender();
    await settle();
    expect(openPaywall).toHaveBeenCalledOnce();

    account.user = { _id: "user_1" };
    hook.rerender();
    await settle();
    expect(openPaywall).toHaveBeenCalledOnce();
  });
});

describe("useReplayOnboarding retries", () => {
  it("does not retry a failed save just because it saved the failure", async () => {
    createLinkItem.mockImplementation(failingServer());
    queueDemoUrl("https://example.com/a");

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createLinkItem).toHaveBeenCalledOnce();
    expect(getPendingDemoUrl()).toBe("https://example.com/a");
  });

  it("retries failed work on the next mount", async () => {
    createLinkItem.mockImplementation(failingServer());
    queueDemoUrl("https://example.com/a");
    const first = renderHook(() => useReplayOnboarding());
    await settle();
    first.unmount();

    createLinkItem.mockResolvedValue("item");
    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createLinkItem).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("retries failed work after the entitlement comes back", async () => {
    createLinkItem.mockImplementation(failingServer());
    queueDemoUrl("https://example.com/a");
    const hook = renderHook(() => useReplayOnboarding());
    await settle();

    entitlement.entitled = false;
    hook.rerender();
    await settle();
    createLinkItem.mockResolvedValue("item");
    entitlement.entitled = true;
    hook.rerender();
    await settle();

    expect(createLinkItem).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("retries when the entitlement changes while a pass is in flight", async () => {
    let failFirst: (error: Error) => void = () => {};
    createLinkItem.mockImplementationOnce(
      () => new Promise((_, reject) => (failFirst = reject)),
    );
    queueDemoUrl("https://example.com/a");
    const hook = renderHook(() => useReplayOnboarding());
    await settle();

    entitlement.entitled = false;
    hook.rerender();
    entitlement.entitled = true;
    hook.rerender();
    createLinkItem.mockResolvedValue("item");
    await act(async () => failFirst(new Error("server error")));
    await settle();

    expect(createLinkItem).toHaveBeenCalledTimes(2);
    expect(hasPending()).toBe(false);
  });

  it("runs work that arrives while a pass is in flight", async () => {
    let failLink: (error: Error) => void = () => {};
    createLinkItem.mockImplementationOnce(
      () => new Promise((_, reject) => (failLink = reject)),
    );
    queueDemoUrl("https://example.com/a");
    renderHook(() => useReplayOnboarding());
    await settle();

    createLinkItem.mockResolvedValue("item");
    await act(async () => {
      queueDemoUrl("https://example.com/b");
      failLink(new Error("server error"));
    });
    await settle();

    expect(createLinkItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "https://example.com/b" }),
    );
    expect(hasPending()).toBe(false);
  });

  it("runs new pending work without a remount", async () => {
    createLinkItem.mockImplementation(failingServer());
    queueDemoUrl("https://example.com/a");
    renderHook(() => useReplayOnboarding());
    await settle();

    createLinkItem.mockResolvedValue("item");
    act(() => queueDemoUrl("https://example.com/b"));
    await settle();

    expect(createLinkItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "https://example.com/b" }),
    );
    expect(hasPending()).toBe(false);
  });
});

describe("the goals picked in onboarding", () => {
  it("save the sample reel without creating a space for each goal", async () => {
    createLinkItem.mockResolvedValue("item");
    setPendingSpaces(["Recipes", "Trips"]);
    queueDemoUrl("https://example.com/reel");

    renderHook(() => useReplayOnboarding());
    await settle();

    expect(createSpace).not.toHaveBeenCalled();
    expect(createLinkItem).toHaveBeenCalledOnce();
    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/reel",
        spaceId: undefined,
        saveSource: "onboarding_demo",
      }),
    );
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

    expect(createSpace).not.toHaveBeenCalled();
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

    const first = renderHook(() => useReplayOnboarding());
    await settle();
    first.unmount();
    const relaunched = renderHook(() => useReplayOnboarding());
    await settle();
    expect(openPaywall).not.toHaveBeenCalled();
    expect(createSpace).not.toHaveBeenCalled();

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
  it("is saved by a fresh pass instead of cleared with the first link", async () => {
    let finishFirst: (id: string) => void = () => {};
    createLinkItem.mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = resolve)),
    );
    createLinkItem.mockResolvedValue("item");
    queueDemoUrl("https://example.com/first");
    renderHook(() => useReplayOnboarding());
    await settle();

    await act(async () => {
      queueDemoUrl("https://example.com/late");
      finishFirst("item");
    });
    await settle();

    expect(createLinkItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/late" }),
    );
    expect(createLinkItem.mock.calls[1][0].operationId).not.toBe(
      createLinkItem.mock.calls[0][0].operationId,
    );
    expect(hasPending()).toBe(false);
  });

  it("keeps the first link's operation while its space is being created", async () => {
    let finishSpace: (id: string) => void = () => {};
    createSpace.mockImplementationOnce(
      () => new Promise((resolve) => (finishSpace = resolve)),
    );
    const saved = new Map<string, string>();
    createLinkItem.mockImplementation(
      ({ operationId, url }: { operationId: string; url: string }) => {
        if (!saved.has(operationId)) saved.set(operationId, url);
        return Promise.resolve(operationId);
      },
    );
    queueDemoUrl("https://example.com/first", "Recipes");
    renderHook(() => useReplayOnboarding());
    await settle();

    await act(async () => {
      queueDemoUrl("https://example.com/late");
      finishSpace("space");
    });
    await settle();

    expect([...saved.values()]).toEqual([
      "https://example.com/first",
      "https://example.com/late",
    ]);
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

// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Replay = typeof import("./replay-onboarding");
type Store = typeof import("./pending-onboarding");

const PENDING_KEY = "shelvr.pending.onboarding";

// The hook's effect runs once per revision; a regression that re-enters on
// its own write would otherwise spin until the runner's timeout. Past this
// many calls the mutation succeeds, so such a loop ends and the call-count
// assertion fails with a number instead of a hang.
const RUNAWAY_CAP = 12;

const storage = vi.hoisted(() => new Map<string, string>());
const state = vi.hoisted(() => ({
  authenticated: true,
  onboarded: true,
  entitlement: { entitled: true, loading: false },
  createSpace:
    vi.fn<(args: { name: string; dynamic: boolean }) => Promise<string>>(),
  createLinkItem:
    vi.fn<
      (args: {
        url: string;
        operationId: string;
        analyticsSessionId: string;
      }) => Promise<string>
    >(),
  openPaywall: vi.fn<() => Promise<boolean>>(),
  uuid: 0,
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${(state.uuid += 1)}`,
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    spaces: { createSpace: "createSpace" },
    items: { createLinkItem: "createLinkItem" },
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useMutation: (ref: string) =>
    ref === "createSpace" ? state.createSpace : state.createLinkItem,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({
  analytics: { sessionId: () => "session" },
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: state.onboarded }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => state.entitlement,
  openPaywall: state.openPaywall,
  waitForSheetTransition: () => Promise.resolve(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets the hook's async run and React's follow-up renders settle. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

function spacesRespond(respond: (name: string) => Promise<string>) {
  state.createSpace.mockImplementation(({ name }) =>
    state.createSpace.mock.calls.length > RUNAWAY_CAP
      ? Promise.resolve(`space:${name}`)
      : respond(name),
  );
}

function spacesFailing(names: "all" | string[]) {
  spacesRespond((name) =>
    names === "all" || names.includes(name)
      ? Promise.reject(new Error("offline"))
      : Promise.resolve(`space:${name}`),
  );
}

function spacesSucceeding() {
  spacesRespond((name) => Promise.resolve(`space:${name}`));
}

const createdNames = () => state.createSpace.mock.calls.map(([a]) => a.name);

const record = (): {
  operationId: string;
  spaces: string[];
  demoUrl: string | null;
} | null => {
  const raw = storage.get(PENDING_KEY);
  return raw ? (JSON.parse(raw) as ReturnType<typeof record>) : null;
};

function seedLegacy(spaces: string[], demoUrl: string | null) {
  storage.set(
    PENDING_KEY,
    JSON.stringify({ operationId: "legacy-operation", spaces, demoUrl }),
  );
}

const demoNoise = {
  url: "https://example.com/design",
  destination: null,
  source: "direct" as const,
};

let replay: Replay;
let store: Store;

beforeEach(async () => {
  vi.resetModules();
  storage.clear();
  state.uuid = 0;
  state.authenticated = true;
  state.onboarded = true;
  state.entitlement = { entitled: true, loading: false };
  state.createSpace.mockReset();
  state.createLinkItem.mockReset();
  state.openPaywall.mockReset();
  spacesSucceeding();
  state.createLinkItem.mockImplementation(() => Promise.resolve("item-1"));
  state.openPaywall.mockResolvedValue(false);
  replay = await import("./replay-onboarding");
  store = await import("./pending-onboarding");
});

function mountReplay() {
  return renderHook(() => replay.useReplayOnboarding());
}

async function setEntitlement(
  hook: ReturnType<typeof mountReplay>,
  entitlement: { entitled: boolean; loading: boolean },
) {
  state.entitlement = entitlement;
  hook.rerender();
  await flush();
}

describe("useReplayOnboarding", () => {
  it("creates each starter space once and clears the store when all succeed", async () => {
    store.setPendingSpaces(["Recipes", "Travel"]);
    const hook = mountReplay();
    await flush();

    expect(state.createSpace).toHaveBeenCalledTimes(2);
    expect(state.createSpace).toHaveBeenCalledWith({
      name: "Recipes",
      dynamic: true,
    });
    expect(store.hasPending()).toBe(false);

    hook.rerender();
    await flush();
    expect(state.createSpace).toHaveBeenCalledTimes(2);
  });

  it("keeps every failed space after a complete failure without retrying itself", async () => {
    store.setPendingSpaces(["Recipes", "Travel"]);
    const operationId = store.getPendingReplayWork()?.operationId;
    spacesFailing("all");
    const hook = mountReplay();
    await flush();
    await flush();
    hook.rerender();
    await flush();

    expect(createdNames()).toEqual(["Recipes", "Travel"]);
    expect(record()).toMatchObject({
      operationId,
      spaces: ["Recipes", "Travel"],
    });
    expect(store.hasPending()).toBe(true);
  });

  it("persists only the failed subset after a partial success, with no immediate second pass", async () => {
    store.setPendingSpaces(["Recipes", "Travel"]);
    const operationId = store.getPendingReplayWork()?.operationId;
    spacesFailing(["Travel"]);
    const hook = mountReplay();
    await flush();
    await flush();
    hook.rerender();
    await flush();

    expect(createdNames()).toEqual(["Recipes", "Travel"]);
    expect(record()).toMatchObject({ operationId, spaces: ["Travel"] });
  });

  it("does not treat demo-progress notifications or rerenders as retry events", async () => {
    store.setPendingSpaces(["Recipes"]);
    spacesFailing("all");
    const hook = mountReplay();
    await flush();
    expect(state.createSpace).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.setPendingDemo(demoNoise);
    });
    await flush();
    await act(async () => {
      store.setOnboardingProgress({
        saveKinds: [],
        spaces: ["Recipes"],
        step: 3,
      });
    });
    await flush();
    await act(async () => {
      store.setPendingDemo(null);
    });
    await flush();
    hook.rerender();
    await flush();

    expect(state.createSpace).toHaveBeenCalledTimes(1);
    expect(record()).toMatchObject({ spaces: ["Recipes"] });
  });

  it("retries failed work once on a remount", async () => {
    store.setPendingSpaces(["Recipes"]);
    spacesFailing("all");
    const first = mountReplay();
    await flush();
    expect(state.createSpace).toHaveBeenCalledTimes(1);
    first.unmount();

    spacesSucceeding();
    mountReplay();
    await flush();

    expect(createdNames()).toEqual(["Recipes", "Recipes"]);
    expect(store.hasPending()).toBe(false);
  });

  it("retries failed work once after a real entitlement transition", async () => {
    store.setPendingSpaces(["Recipes"]);
    spacesFailing("all");
    const hook = mountReplay();
    await flush();
    expect(state.createSpace).toHaveBeenCalledTimes(1);

    // The entitlement lapses: the failed work waits behind the paywall.
    await setEntitlement(hook, { entitled: false, loading: false });
    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(state.createSpace).toHaveBeenCalledTimes(1);

    spacesSucceeding();
    await setEntitlement(hook, { entitled: true, loading: false });
    expect(createdNames()).toEqual(["Recipes", "Recipes"]);
    expect(store.hasPending()).toBe(false);
  });

  it("does not count a reloading entitlement that settles unchanged as a transition", async () => {
    store.setPendingSpaces(["Recipes"]);
    spacesFailing("all");
    const hook = mountReplay();
    await flush();

    await setEntitlement(hook, { entitled: false, loading: true });
    await setEntitlement(hook, { entitled: true, loading: false });

    expect(state.createSpace).toHaveBeenCalledTimes(1);
    expect(state.openPaywall).not.toHaveBeenCalled();
    expect(record()).toMatchObject({ spaces: ["Recipes"] });
  });

  it("runs genuinely new external work without a remount", async () => {
    store.setPendingSpaces(["Recipes"]);
    spacesFailing("all");
    mountReplay();
    await flush();
    expect(state.createSpace).toHaveBeenCalledTimes(1);

    spacesSucceeding();
    await act(async () => {
      store.setPendingSpaces(["Travel"]);
    });
    await flush();

    expect(createdNames()).toEqual(["Recipes", "Travel"]);
    expect(store.hasPending()).toBe(false);
  });

  it.each(["resolves", "rejects"] as const)(
    "does not let a stale run overwrite work supplied while it was in flight (first space %s)",
    async (outcome) => {
      store.setPendingSpaces(["Recipes"]);
      const recipes = deferred<string>();
      const travel = deferred<string>();
      spacesRespond((name) =>
        name === "Recipes" ? recipes.promise : travel.promise,
      );
      mountReplay();
      await flush();
      expect(createdNames()).toEqual(["Recipes"]);

      await act(async () => {
        store.setPendingSpaces(["Travel"]);
      });
      const newOperationId = store.getPendingReplayWork()?.operationId;
      await flush();
      // Serialized: the new work waits for the in-flight run.
      expect(createdNames()).toEqual(["Recipes"]);

      await act(async () => {
        if (outcome === "resolves") recipes.resolve("space:Recipes");
        else recipes.reject(new Error("offline"));
      });
      await flush();

      expect(record()).toMatchObject({
        operationId: newOperationId,
        spaces: ["Travel"],
      });
      expect(createdNames()).toEqual(["Recipes", "Travel"]);

      await act(async () => {
        travel.resolve("space:Travel");
      });
      await flush();
      expect(store.hasPending()).toBe(false);
    },
  );

  it("remembers an entitlement that lands while the replay paywall is open", async () => {
    state.entitlement = { entitled: false, loading: false };
    const paywall = deferred<boolean>();
    state.openPaywall.mockReturnValue(paywall.promise);
    store.setPendingSpaces(["Recipes"]);
    const hook = mountReplay();
    await flush();
    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(state.createSpace).not.toHaveBeenCalled();

    await setEntitlement(hook, { entitled: true, loading: false });
    // Still one active replay: nothing runs beside the open paywall.
    expect(state.createSpace).not.toHaveBeenCalled();

    await act(async () => {
      paywall.resolve(true);
    });
    await flush();

    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(createdNames()).toEqual(["Recipes"]);
    expect(store.hasPending()).toBe(false);
  });

  it("remembers an entitlement lapse while a mutation is in flight", async () => {
    store.setPendingSpaces(["Recipes"]);
    const recipes = deferred<string>();
    spacesRespond(() => recipes.promise);
    const hook = mountReplay();
    await flush();

    await setEntitlement(hook, { entitled: false, loading: false });
    expect(state.openPaywall).not.toHaveBeenCalled();

    await act(async () => {
      recipes.reject(new Error("offline"));
    });
    await flush();

    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(state.createSpace).toHaveBeenCalledTimes(1);
    expect(record()).toMatchObject({ spaces: ["Recipes"] });
  });

  it("waits for a purchased entitlement instead of asking again", async () => {
    state.entitlement = { entitled: false, loading: false };
    state.openPaywall.mockResolvedValue(true);
    store.setPendingSpaces(["Recipes"]);
    const hook = mountReplay();
    await flush();
    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(state.createSpace).not.toHaveBeenCalled();

    await act(async () => {
      store.setPendingDemo(demoNoise);
    });
    hook.rerender();
    await flush();
    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(state.createSpace).not.toHaveBeenCalled();

    await setEntitlement(hook, { entitled: true, loading: false });
    expect(createdNames()).toEqual(["Recipes"]);
    expect(store.hasPending()).toBe(false);
  });

  it("does not reopen a cancelled replay paywall on store noise or rerenders", async () => {
    state.entitlement = { entitled: false, loading: false };
    store.setPendingSpaces(["Recipes"]);
    const hook = mountReplay();
    await flush();
    expect(state.openPaywall).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.setPendingDemo(demoNoise);
    });
    hook.rerender();
    await flush();

    expect(state.openPaywall).toHaveBeenCalledTimes(1);
    expect(record()).toMatchObject({ spaces: ["Recipes"] });
  });

  it("does not show the paywall again when it was declined during onboarding", async () => {
    replay.noteDeclinedDuringOnboarding();
    state.entitlement = { entitled: false, loading: false };
    store.setPendingSpaces(["Recipes"]);
    const hook = mountReplay();
    await flush();
    expect(state.openPaywall).not.toHaveBeenCalled();
    expect(record()).toMatchObject({ spaces: ["Recipes"] });

    await setEntitlement(hook, { entitled: true, loading: false });
    expect(createdNames()).toEqual(["Recipes"]);
    expect(store.hasPending()).toBe(false);
  });

  it("retries a legacy queued save under its stable operation id, without a self-retry", async () => {
    seedLegacy([], "https://example.com/queued");
    state.createLinkItem.mockImplementation(() =>
      state.createLinkItem.mock.calls.length > RUNAWAY_CAP
        ? Promise.resolve("item-1")
        : Promise.reject(new Error("offline")),
    );
    const first = mountReplay();
    await flush();
    await flush();
    first.rerender();
    await flush();

    expect(state.createLinkItem).toHaveBeenCalledTimes(1);
    expect(state.createLinkItem).toHaveBeenCalledWith({
      url: "https://example.com/queued",
      operationId: "legacy-operation",
      analyticsSessionId: "session",
    });
    expect(record()).toMatchObject({
      operationId: "legacy-operation",
      demoUrl: "https://example.com/queued",
    });
    first.unmount();

    state.createLinkItem.mockImplementation(() => Promise.resolve("item-1"));
    mountReplay();
    await flush();

    expect(state.createLinkItem).toHaveBeenCalledTimes(2);
    expect(state.createLinkItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: "legacy-operation" }),
    );
    expect(store.hasPending()).toBe(false);
  });

  it("leaves a legacy link queued when new work arrives during its save, then retries it under the same operation", async () => {
    seedLegacy([], "https://example.com/queued");
    const link = deferred<string>();
    state.createLinkItem.mockImplementationOnce(() => link.promise);
    mountReplay();
    await flush();
    expect(state.createLinkItem).toHaveBeenCalledTimes(1);

    // A queued link pins the operation, so the new work shares it.
    await act(async () => {
      store.setPendingSpaces(["Travel"]);
    });
    expect(store.getPendingReplayWork()?.operationId).toBe("legacy-operation");
    await act(async () => {
      link.resolve("item-1");
    });
    await flush();

    expect(createdNames()).toEqual(["Travel"]);
    expect(state.createLinkItem).toHaveBeenCalledTimes(2);
    expect(state.createLinkItem.mock.calls.map(([a]) => a.operationId)).toEqual(
      ["legacy-operation", "legacy-operation"],
    );
    expect(store.hasPending()).toBe(false);
  });

  it("keeps the failed subset and clears only the saved legacy link", async () => {
    seedLegacy(["Recipes", "Travel"], "https://example.com/queued");
    spacesFailing(["Recipes"]);
    const hook = mountReplay();
    await flush();
    await flush();
    hook.rerender();
    await flush();

    expect(createdNames()).toEqual(["Recipes", "Travel"]);
    expect(state.createLinkItem).toHaveBeenCalledTimes(1);
    expect(record()).toEqual(
      expect.objectContaining({
        operationId: "legacy-operation",
        spaces: ["Recipes"],
        demoUrl: null,
      }),
    );
    expect(store.hasPending()).toBe(true);
  });

  it("does nothing while signed out, mid-onboarding, or with nothing pending", async () => {
    state.authenticated = false;
    store.setPendingSpaces(["Recipes"]);
    const signedOut = mountReplay();
    await flush();
    expect(state.createSpace).not.toHaveBeenCalled();
    signedOut.unmount();

    state.authenticated = true;
    state.onboarded = false;
    const midOnboarding = mountReplay();
    await flush();
    expect(state.createSpace).not.toHaveBeenCalled();
    midOnboarding.unmount();

    state.onboarded = true;
    store.clearPending();
    mountReplay();
    await flush();
    expect(state.createSpace).not.toHaveBeenCalled();
    expect(state.openPaywall).not.toHaveBeenCalled();
  });
});

describe("useAwaitingOnboardingPurchase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a purchase's entitlement, but not forever", () => {
    replay.notePurchasedDuringOnboarding();
    const { result } = renderHook(() =>
      replay.useAwaitingOnboardingPurchase(false),
    );
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(false);
  });

  it("stops waiting once the entitlement lands, and does not wait again if it lapses", () => {
    replay.notePurchasedDuringOnboarding();
    const { result, rerender } = renderHook(
      ({ entitled }) => replay.useAwaitingOnboardingPurchase(entitled),
      { initialProps: { entitled: false } },
    );
    expect(result.current).toBe(true);

    rerender({ entitled: true });
    expect(result.current).toBe(false);

    rerender({ entitled: false });
    expect(result.current).toBe(false);
  });

  it("does not wait when nothing was bought in onboarding", () => {
    const { result } = renderHook(() =>
      replay.useAwaitingOnboardingPurchase(false),
    );
    expect(result.current).toBe(false);
  });
});

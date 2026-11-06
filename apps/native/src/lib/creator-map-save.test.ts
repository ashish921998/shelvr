// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  creatorMapFailureAlert,
  creatorMapSaveOutcome,
  creatorMapSaveStep,
  useCreatorMapSaveCoordinator,
} from "./creator-map-save";

const mocks = vi.hoisted(() => ({
  onboarded: true,
  raw: null as string | null,
  save: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  success: vi.fn(),
  completeOnboarding: vi.fn(),
  holdIncomingShare: vi.fn(),
  clearPending: vi.fn(),
  clearPendingCreatorMap: vi.fn(),
  shareRefOf: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock("expo-secure-store", () => ({
  getItem: () => null,
  setItem: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({
    onboarded: mocks.onboarded,
    completeOnboarding: mocks.completeOnboarding,
  }),
}));
vi.mock("@/lib/onboarding-exit", () => ({
  holdIncomingShare: mocks.holdIncomingShare,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: mocks.clearPending,
}));
vi.mock("@/lib/pending-creator-map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pending-creator-map")>()),
  clearPendingCreatorMap: mocks.clearPendingCreatorMap,
  getPendingCreatorMap: () => mocks.raw,
  subscribePendingCreatorMap: () => () => {},
}));
vi.mock("@/lib/public-map", () => ({
  publicMapUrl: (token: string) => `https://shelvr.app/m/${token}`,
}));
vi.mock("@/lib/share-link", () => ({ shareRefOf: mocks.shareRefOf }));
vi.mock("@convex/_generated/api", () => ({
  api: { creatorMaps: { saveCreatorMap: "saveCreatorMap" } },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useMutation: () => mocks.save,
}));
vi.mock("expo-router", () => ({ useRouter: () => mocks.router }));

const TOKEN = "0123456789abcdef0123456789abcdef";
const NOW = Date.now();
const pending = {
  token: TOKEN,
  city: "Mexico City",
  name: "Maya’s Mexico City",
  at: NOW,
};
const raw = JSON.stringify(pending);
const settled = {
  isLoading: false,
  isAuthenticated: true,
  inFlight: null,
  now: NOW,
};
const listId = "list1" as Id<"sharedLists">;
const rateLimited = new ConvexError({
  kind: "RateLimited",
  name: "creatorMapSavePage",
  retryAfter: 1000,
});

describe("creatorMapSaveStep", () => {
  it("waits with no slot", () => {
    expect(creatorMapSaveStep({ ...settled, raw: null })).toEqual({
      kind: "wait",
    });
  });

  it("waits while auth loads or the person is signed out, keeping the slot", () => {
    expect(creatorMapSaveStep({ ...settled, raw, isLoading: true })).toEqual({
      kind: "wait",
    });
    expect(
      creatorMapSaveStep({ ...settled, raw, isAuthenticated: false }),
    ).toEqual({ kind: "wait" });
  });

  it("drops an expired or malformed slot, signed in or not", () => {
    const expired = JSON.stringify({ ...pending, at: NOW - 25 * 3_600_000 });
    expect(creatorMapSaveStep({ ...settled, raw: expired })).toEqual({
      kind: "drop",
    });
    expect(
      creatorMapSaveStep({ ...settled, raw: "{", isAuthenticated: false }),
    ).toEqual({ kind: "drop" });
  });

  it("saves once signed in, and only once while that slot is in flight", () => {
    expect(creatorMapSaveStep({ ...settled, raw })).toEqual({
      kind: "save",
      raw,
      pending,
    });
    expect(creatorMapSaveStep({ ...settled, raw, inFlight: raw })).toEqual({
      kind: "wait",
    });
  });

  it("saves a slot whose name is too long for a list, since the server tidies it", () => {
    const long = JSON.stringify({ ...pending, name: "n".repeat(100) });
    expect(creatorMapSaveStep({ ...settled, raw: long }).kind).toBe("save");
  });
});

describe("creatorMapSaveOutcome", () => {
  const saved = {
    status: "saved" as const,
    listId,
    added: 4,
    created: true,
  };

  it("opens the list, finishing onboarding only for a person who had not", () => {
    expect(creatorMapSaveOutcome(saved, pending, true)).toEqual({
      completeOnboarding: false,
      href: "/shared-list/list1",
      alert: null,
      success: true,
    });
    expect(
      creatorMapSaveOutcome(saved, pending, false).completeOnboarding,
    ).toBe(true);
  });

  it("shows the Dead state for a map that is gone", () => {
    expect(creatorMapSaveOutcome({ status: "gone" }, pending, false)).toEqual({
      completeOnboarding: false,
      href: `/creator-map/${TOKEN}?city=Mexico%20City`,
      alert: null,
      success: false,
    });
  });

  it.each([
    ["empty", "creatorMaps.emptyTitle"],
    ["tooManyLists", "creatorMaps.tooManyLists"],
  ] as const)("alerts for %s and stays put", (status, alert) => {
    expect(creatorMapSaveOutcome({ status }, pending, false)).toEqual({
      completeOnboarding: false,
      href: null,
      alert,
      success: false,
    });
  });
});

describe("creatorMapFailureAlert", () => {
  it("says to wait after a rate limit, and to try again after anything else", () => {
    expect(creatorMapFailureAlert(rateLimited)).toBe("creatorMaps.rateLimited");
    expect(creatorMapFailureAlert(new Error("Server Error"))).toBe(
      "creatorMaps.failed",
    );
  });
});

describe("useCreatorMapSaveCoordinator", () => {
  async function saveWith(onboarded: boolean, result: unknown) {
    mocks.onboarded = onboarded;
    if (result instanceof Error) mocks.save.mockRejectedValue(result);
    else mocks.save.mockResolvedValue(result);
    const hook = renderHook(() => useCreatorMapSaveCoordinator());
    await act(async () => {});
    return hook;
  }

  const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
    mock.mock.invocationCallOrder[0]!;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.raw = raw;
    mocks.shareRefOf.mockResolvedValue("0123456789abcdef");
  });

  it("saves a person who was not onboarded into their new list", async () => {
    await saveWith(false, { status: "saved", listId, added: 4, created: true });
    expect(mocks.save).toHaveBeenCalledWith({
      token: TOKEN,
      city: "Mexico City",
      name: "Maya’s Mexico City",
    });
    expect(order(mocks.clearPendingCreatorMap)).toBeLessThan(
      order(mocks.success),
    );
    expect(order(mocks.success)).toBeLessThan(order(mocks.holdIncomingShare));
    expect(order(mocks.holdIncomingShare)).toBeLessThan(
      order(mocks.clearPending),
    );
    expect(order(mocks.clearPending)).toBeLessThan(
      order(mocks.completeOnboarding),
    );
    expect(mocks.router.replace).toHaveBeenCalledWith("/shared-list/list1");
    expect(mocks.capture).toHaveBeenCalledWith("creator_map_saved", {
      status: "saved",
      added: 4,
      created: true,
      onboarded_before: false,
      share_ref: "0123456789abcdef",
    });
    expect(mocks.shareRefOf).toHaveBeenCalledWith(
      `https://shelvr.app/m/${TOKEN}`,
    );
  });

  it("leaves onboarding alone for a person who already finished it", async () => {
    await saveWith(true, { status: "saved", listId, added: 2, created: false });
    expect(mocks.holdIncomingShare).not.toHaveBeenCalled();
    expect(mocks.clearPending).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith("/shared-list/list1");
    expect(mocks.capture).toHaveBeenCalledWith(
      "creator_map_saved",
      expect.objectContaining({ onboarded_before: true, created: false }),
    );
  });

  it("shows the Dead state when the map is gone", async () => {
    await saveWith(false, { status: "gone" });
    expect(mocks.clearPendingCreatorMap).toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith(
      `/creator-map/${TOKEN}?city=Mexico%20City`,
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith("creator_map_saved", {
      status: "gone",
      added: 0,
      created: false,
      onboarded_before: false,
      share_ref: "0123456789abcdef",
    });
  });

  it.each([
    ["empty", "creatorMaps.emptyTitle"],
    ["tooManyLists", "creatorMaps.tooManyLists"],
  ])("alerts %s without leaving the screen", async (status, alert) => {
    await saveWith(true, { status });
    expect(mocks.clearPendingCreatorMap).toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith(alert);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["a rate limit", rateLimited, "creatorMaps.rateLimited"],
    ["any other failure", new Error("Server Error"), "creatorMaps.failed"],
  ])("clears the slot and alerts after %s", async (_name, error, alert) => {
    await saveWith(false, error);
    expect(mocks.clearPendingCreatorMap).toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "creator_map_save_failed",
      error,
    );
    expect(mocks.alert).toHaveBeenCalledWith(alert);
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("leaves the share ref out when it cannot be worked out", async () => {
    mocks.shareRefOf.mockResolvedValue(undefined);
    await saveWith(true, { status: "empty" });
    const properties = mocks.capture.mock.calls[0]?.[1] as object;
    expect(properties).not.toHaveProperty("share_ref");
  });

  it("calls the server once for one slot across renders", async () => {
    mocks.save.mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useCreatorMapSaveCoordinator());
    hook.rerender();
    hook.rerender();
    await act(async () => {});
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("clears a slot that has expired without calling the server", async () => {
    mocks.raw = JSON.stringify({ ...pending, at: NOW - 25 * 3_600_000 });
    renderHook(() => useCreatorMapSaveCoordinator());
    await act(async () => {});
    expect(mocks.clearPendingCreatorMap).toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

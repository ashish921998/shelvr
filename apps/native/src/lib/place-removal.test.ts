// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { usePlaceRemoval } from "./place-removal";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  restore: vi.fn(),
  alert: vi.fn(),
  error: vi.fn(),
  capture: vi.fn(),
  success: vi.fn(),
  openPaywall: vi.fn(),
  access: { kind: "locked" } as { kind: string; syncing?: boolean },
}));
vi.mock("@/lib/entitlement", () => ({
  openPaywallAnswer: mocks.openPaywall,
  useEntitlement: () => ({ entitled: false, loading: false }),
}));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@/lib/revenuecat-module", () => ({ getPurchases: () => null }));
vi.mock("@/lib/paywall-goal", () => ({}));
vi.mock("@/lib/trial-reminder-lead", () => ({}));
vi.mock("@/lib/date", () => ({}));
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n-core")>()),
  t: (key: string) => key,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@convex/_generated/api", () => ({
  api: { placeRemovals: { removePlace: "remove", undoRemovePlace: "restore" } },
}));
vi.mock("convex/react", () => ({
  useMutation: (name: string) =>
    name === "remove" ? mocks.remove : mocks.restore,
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.error, capture: mocks.capture },
}));

const ITEM = "item1" as Id<"items">;
const PIN = { name: "Tigre", lat: 38.7, lng: -9.1 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access = { kind: "locked" };
  vi.useFakeTimers();
  mocks.remove.mockResolvedValue("removal1");
  mocks.restore.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
});

it("offers Undo after the server removes the venue, then restores that operation", async () => {
  const { result } = renderHook(usePlaceRemoval);
  const cityPin = { ...PIN, itemId: ITEM, number: 1, appleId: "tigre" };
  await act(() => result.current.remove(ITEM, cityPin));
  expect(mocks.remove).toHaveBeenCalledWith({
    itemId: ITEM,
    ...PIN,
    appleId: "tigre",
  });
  expect(result.current.undo?.name).toBe("Tigre");
  await act(() => result.current.restore());
  expect(mocks.restore).toHaveBeenCalledWith({
    removalId: "removal1",
  });
  expect(result.current.undo).toBeNull();
});

it("confirms a removal and its Undo only once the server has applied them", async () => {
  const { result } = renderHook(usePlaceRemoval);
  mocks.remove.mockRejectedValueOnce(new Error("offline"));
  await act(() => result.current.remove(ITEM, PIN));
  expect(mocks.success).not.toHaveBeenCalled();
  await act(() => result.current.remove(ITEM, PIN));
  expect(mocks.success).toHaveBeenCalledOnce();
  mocks.restore.mockRejectedValueOnce(new Error("offline"));
  await act(() => result.current.restore());
  expect(mocks.success).toHaveBeenCalledOnce();
  await act(() => result.current.restore());
  expect(mocks.success).toHaveBeenCalledTimes(2);
});

it("expires Undo after six seconds without making another write", async () => {
  const { result } = renderHook(usePlaceRemoval);
  await act(() => result.current.remove(ITEM, PIN));
  act(() => vi.advanceTimersByTime(5999));
  expect(result.current.undo).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.undo).toBeNull();
  expect(mocks.restore).not.toHaveBeenCalled();
});

it("reports failed removal without offering Undo, and retains Undo when restoration fails", async () => {
  const { result } = renderHook(usePlaceRemoval);
  mocks.remove.mockRejectedValueOnce(new Error("offline"));
  await act(() => result.current.remove(ITEM, PIN));
  expect(result.current.undo).toBeNull();
  expect(mocks.alert).toHaveBeenCalledOnce();
  await act(() => result.current.remove(ITEM, PIN));
  mocks.restore.mockRejectedValueOnce(new Error("offline"));
  await act(() => result.current.restore());
  expect(result.current.undo).not.toBeNull();
  expect(result.current.busy).toBe(false);
  expect(mocks.error).toHaveBeenCalledTimes(2);
});

it("ignores repeated taps while a request is in progress", async () => {
  let finish: (id: Id<"placeRemovals">) => void = () => {};
  mocks.remove.mockImplementation(
    () =>
      new Promise<Id<"placeRemovals">>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(usePlaceRemoval);
  let pending: Promise<void>;
  act(() => {
    pending = result.current.remove(ITEM, PIN);
  });
  expect(result.current.busy).toBe(true);
  await act(() => result.current.remove(ITEM, PIN));
  expect(mocks.remove).toHaveBeenCalledOnce();
  await act(async () => {
    finish("removal1" as Id<"placeRemovals">);
    await pending;
  });
  expect(result.current.busy).toBe(false);
});

it("keeps consecutive removals recoverable, giving each its own Undo window", async () => {
  mocks.remove.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
  const { result } = renderHook(usePlaceRemoval);
  await act(() => result.current.remove(ITEM, PIN));
  act(() => vi.advanceTimersByTime(5000));
  await act(() => result.current.remove(ITEM, { ...PIN, name: "Other" }));
  expect(result.current.undo?.removalId).toBe("first");
  await act(() => result.current.restore());
  expect(mocks.restore).toHaveBeenLastCalledWith({ removalId: "first" });
  expect(result.current.undo?.name).toBe("Other");
  act(() => vi.advanceTimersByTime(5999));
  expect(result.current.undo?.name).toBe("Other");
  await act(() => result.current.restore());
  expect(mocks.restore).toHaveBeenLastCalledWith({ removalId: "second" });
  expect(result.current.undo).toBeNull();
});

it("pauses expiry during a late Undo and offers a fresh retry window on failure", async () => {
  let reject: (error: Error) => void = () => {};
  mocks.restore.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result } = renderHook(usePlaceRemoval);
  await act(() => result.current.remove(ITEM, PIN));
  act(() => vi.advanceTimersByTime(5900));
  let restoring: Promise<void> = Promise.resolve();
  act(() => {
    restoring = result.current.restore();
  });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.undo).not.toBeNull();
  await act(async () => {
    reject(new Error("offline"));
    await restoring;
  });
  expect(result.current.undo).not.toBeNull();
  act(() => vi.advanceTimersByTime(5999));
  expect(result.current.undo).not.toBeNull();
  await act(() => result.current.restore());
  expect(result.current.undo).toBeNull();
});

it("opens the paywall instead of an error when removing needs Pro", async () => {
  const { result } = renderHook(usePlaceRemoval);
  mocks.remove.mockRejectedValueOnce(new ConvexError({ code: "pro_required" }));
  await act(() => result.current.remove(ITEM, PIN));
  expect(mocks.openPaywall).toHaveBeenCalledWith({}, "remove_place");
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("counts a removal that runs after a purchase as the blocked action resumed", async () => {
  const funnel = await import("@/lib/paywall-funnel");
  mocks.openPaywall.mockImplementation(() => {
    funnel.recordAccess("purchase");
    mocks.access = { kind: "pro", syncing: false };
    return Promise.resolve({ outcome: "success", answered: true });
  });
  const { result, rerender } = renderHook(usePlaceRemoval);
  mocks.remove.mockRejectedValueOnce(new ConvexError({ code: "pro_required" }));
  await act(() => result.current.remove(ITEM, PIN));
  rerender();
  await act(() => result.current.remove(ITEM, PIN));
  expect(mocks.capture).toHaveBeenCalledWith(
    "paywall_blocked_action_resumed",
    expect.objectContaining({
      placement: "remove_place",
      purchased_since_block: true,
    }),
  );
});

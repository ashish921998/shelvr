// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { usePlaceRemoval } from "./place-removal";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  restore: vi.fn(),
  announce: vi.fn(),
  alert: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { placeVisits: { removePlace: "remove", undoRemovePlace: "restore" } },
}));
vi.mock("convex/react", () => ({
  useMutation: (name: string) =>
    name === "remove" ? mocks.remove : mocks.restore,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "operation" }));
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: mocks.announce },
  Alert: { alert: mocks.alert },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.error },
}));

const ITEM = "item1" as Id<"items">;
const PIN = { name: "Tigre", lat: 38.7, lng: -9.1 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.remove.mockResolvedValue([ITEM]);
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
    operationId: "operation",
  });
  expect(result.current.undo?.name).toBe("Tigre");
  expect(mocks.announce).toHaveBeenCalledWith("Removed Tigre");
  await act(() => result.current.restore());
  expect(mocks.restore).toHaveBeenCalledWith({
    itemIds: [ITEM],
    operationId: "operation",
  });
  expect(result.current.undo).toBeNull();
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
  let finish: (ids: Id<"items">[]) => void = () => {};
  mocks.remove.mockImplementation(
    () =>
      new Promise<Id<"items">[]>((resolve) => {
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
    finish([ITEM]);
    await pending;
  });
  expect(result.current.busy).toBe(false);
});

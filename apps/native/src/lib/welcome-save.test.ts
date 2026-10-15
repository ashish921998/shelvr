// @vitest-environment jsdom
// Real React effects: the sheet's gate is focus, readiness and RevenueCat
// sheet settlement, each supplied by the test.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  justStartedPro,
  useWelcomeSheetVisible,
  welcomeSave,
} from "./welcome-save";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  focused: true,
  focusListeners: new Set<() => void>(),
  settle: [] as (() => void)[],
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mock.store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  whenSheetSettled: () =>
    new Promise<void>((resolve) => {
      mock.settle.push(resolve);
    }),
}));
vi.mock("@/lib/trial-reminder", () => ({
  whenTrialPrimerDone: () => Promise.resolve(),
}));
vi.mock("expo-router", async () => {
  const { useEffect, useSyncExternalStore } = await import("react");
  return {
    // Runs the callback while the screen is focused and its cleanup on blur,
    // like the real hook.
    useFocusEffect: (callback: () => void | (() => void)) => {
      const focused = useSyncExternalStore(
        (listener) => {
          mock.focusListeners.add(listener);
          return () => mock.focusListeners.delete(listener);
        },
        () => mock.focused,
      );
      useEffect(() => (focused ? callback() : undefined), [focused, callback]);
    },
  };
});

function setFocused(focused: boolean) {
  mock.focused = focused;
  for (const listener of mock.focusListeners) listener();
}

async function settleSheets() {
  await act(async () => {
    for (const resolve of mock.settle.splice(0)) resolve();
  });
}

describe("justStartedPro", () => {
  it("fires when a trial or plan starts in this launch", () => {
    expect(justStartedPro("none", "trialing")).toBe(true);
    expect(justStartedPro("none", "pro")).toBe(true);
    expect(justStartedPro("lapsed", "pro")).toBe(true);
  });

  it("skips accounts that were already Pro when the app opened", () => {
    expect(justStartedPro(null, "trialing")).toBe(false);
    expect(justStartedPro(null, "pro")).toBe(false);
  });

  it("skips renewals, conversions and lost access", () => {
    expect(justStartedPro("trialing", "pro")).toBe(false);
    expect(justStartedPro("lifetime", "pro")).toBe(false);
    expect(justStartedPro("trialing", "lapsed")).toBe(false);
    expect(justStartedPro("none", "none")).toBe(false);
  });
});

describe("useWelcomeSheetVisible", () => {
  beforeEach(() => {
    mock.store.clear();
    mock.settle.length = 0;
    mock.focused = true;
  });

  it("stays hidden until the step is queued and the paywall has settled", async () => {
    const { result } = renderHook(() => useWelcomeSheetVisible("user_a", true));
    expect(result.current).toBe(false);
    expect(mock.settle).toHaveLength(0);
    act(() => welcomeSave.mark("user_a"));
    // Queued while the RevenueCat sheet is still closing.
    expect(result.current).toBe(false);
    await settleSheets();
    expect(result.current).toBe(true);
  });

  it("waits while Home is not ready", async () => {
    welcomeSave.mark("user_a");
    const { result, rerender } = renderHook(
      ({ ready }) => useWelcomeSheetVisible("user_a", ready),
      { initialProps: { ready: false } },
    );
    await settleSheets();
    expect(result.current).toBe(false);
    rerender({ ready: true });
    expect(result.current).toBe(true);
  });

  it("waits for Home to be focused, and re-checks sheets on every return", async () => {
    welcomeSave.mark("user_a");
    setFocused(false);
    const { result } = renderHook(() => useWelcomeSheetVisible("user_a", true));
    await settleSheets();
    expect(result.current).toBe(false);
    act(() => setFocused(true));
    expect(result.current).toBe(false);
    await settleSheets();
    expect(result.current).toBe(true);
    // Away and back: a sheet opened elsewhere in between is waited out.
    act(() => setFocused(false));
    act(() => setFocused(true));
    expect(result.current).toBe(false);
    await settleSheets();
    expect(result.current).toBe(true);
  });

  it("hides for good once finished", async () => {
    welcomeSave.mark("user_a");
    const { result } = renderHook(() => useWelcomeSheetVisible("user_a", true));
    await settleSheets();
    expect(result.current).toBe(true);
    act(() => welcomeSave.finish("user_a"));
    expect(result.current).toBe(false);
  });
});

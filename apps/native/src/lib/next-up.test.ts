// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { hourFloor, useNextUp } from "./next-up";

const storage = vi.hoisted(() => new Map<string, string>());
const store = vi.hoisted(() => ({ failWrites: false }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (store.failWrites) throw new Error("keychain unavailable");
    storage.set(key, value);
  },
}));

const mock = vi.hoisted(() => ({
  data: undefined as
    | { kind: "read" | "cook"; subject: string; item: { _id: string } }
    | null
    | undefined,
  lastArgs: undefined as unknown,
  capture: vi.fn(),
}));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
const appState = vi.hoisted(() => ({
  listeners: [] as ((state: string) => void)[],
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listeners.push(listener);
      return { remove: () => undefined };
    },
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_ref: unknown, args: unknown) => ({ args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ args }: { args: unknown; gcTime?: number }) => {
    mock.lastArgs = args;
    return { data: args === "skip" ? undefined : mock.data };
  },
}));

beforeEach(() => {
  storage.clear();
  store.failWrites = false;
  mock.capture.mockClear();
  mock.data = { kind: "read", subject: "Save 1", item: { _id: "item-1" } };
});

describe("hourFloor", () => {
  it("drops minutes so the query args hold within the hour", () => {
    const at = Date.UTC(2026, 9, 8, 11, 42, 13);
    expect(hourFloor(at)).toBe(Date.UTC(2026, 9, 8, 11));
  });
});

describe("useNextUp", () => {
  it("moves its clock on when the app returns to the foreground", () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 8, 22, 30) });
    try {
      renderHook(() => useNextUp("user-1", true));
      expect(mock.lastArgs).toMatchObject({ now: Date.UTC(2026, 9, 8, 22) });
      vi.setSystemTime(Date.UTC(2026, 9, 9, 8, 5));
      act(() => appState.listeners.forEach((listener) => listener("active")));
      expect(mock.lastArgs).toMatchObject({ now: Date.UTC(2026, 9, 9, 8) });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not subscribe for a locked account", () => {
    const { result } = renderHook(() => useNextUp("user-1", false));
    expect(mock.lastArgs).toBe("skip");
    expect(result.current.next).toBeNull();
  });

  it("names the picked save and reports it shown once", () => {
    const { result, rerender } = renderHook(() => useNextUp("user-1", true));
    expect(result.current.next?.item._id).toBe("item-1");
    act(() => result.current.shown());
    rerender();
    act(() => result.current.shown());
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("next_up_shown", {
      kind: "read",
    });
  });

  it("skips a dismissed save on the server and shows the next one", () => {
    const { result, rerender } = renderHook(() => useNextUp("user-1", true));
    act(() => result.current.dismiss());
    expect(result.current.next).toBeNull();
    expect(mock.capture).toHaveBeenCalledWith("next_up_dismissed", {
      kind: "read",
    });

    // The server is asked to skip it and answers with the next save.
    expect(mock.lastArgs).toMatchObject({ skip: ["item-1"] });
    mock.data = { kind: "cook", subject: "Lasagna", item: { _id: "item-2" } };
    rerender();
    expect(result.current.next?.item._id).toBe("item-2");
  });

  it("still skips a dismissed save when the store write fails", () => {
    store.failWrites = true;
    const { result } = renderHook(() => useNextUp("user-1", true));
    act(() => result.current.dismiss());
    expect(result.current.next).toBeNull();
    expect(mock.lastArgs).toMatchObject({ skip: ["item-1"] });
  });

  it("does not carry one account's dismissals into another", () => {
    store.failWrites = true;
    const { result, rerender } = renderHook(
      ({ userId }) => useNextUp(userId, true),
      { initialProps: { userId: "user-1" } },
    );
    act(() => result.current.dismiss());
    rerender({ userId: "user-2" });
    expect(mock.lastArgs).toMatchObject({ skip: [] });
    expect(result.current.next?.item._id).toBe("item-1");
  });

  it("keeps dismissals per account", () => {
    const first = renderHook(() => useNextUp("user-1", true));
    act(() => first.result.current.dismiss());
    const other = renderHook(() => useNextUp("user-2", true));
    expect(other.result.current.next?.item._id).toBe("item-1");
  });
});

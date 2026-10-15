// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { oncePerAccount } from "./once-per-account";

const store = vi.hoisted(() => new Map<string, string>());
const fail = vi.hoisted(() => ({ read: false }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (fail.read) throw new Error("keychain");
    return store.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

describe("oncePerAccount", () => {
  beforeEach(() => {
    store.clear();
    fail.read = false;
  });

  it("queues once per account and stays done once finished", () => {
    const flag = oncePerAccount("test");
    expect(flag.isPending("user_a")).toBe(false);
    flag.mark("user_a");
    expect(flag.isPending("user_a")).toBe(true);
    expect(store.get("shelvr.test.user_a")).toBe("pending");
    flag.finish("user_a");
    expect(flag.isPending("user_a")).toBe(false);
    flag.mark("user_a");
    expect(flag.isPending("user_a")).toBe(false);
    expect(flag.isPending("user_b")).toBe(false);
  });

  it("re-renders subscribers when the flag is queued and finished", () => {
    const flag = oncePerAccount("test");
    const { result } = renderHook(() => flag.usePending("user_a"));
    expect(result.current).toBe(false);
    act(() => flag.mark("user_a"));
    expect(result.current).toBe(true);
    act(() => flag.finish("user_a"));
    expect(result.current).toBe(false);
  });

  it("reads unreadable storage as not pending", () => {
    const flag = oncePerAccount("test");
    fail.read = true;
    expect(flag.isPending("user_a")).toBe(false);
  });
});

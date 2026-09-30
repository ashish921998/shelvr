import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishWelcome,
  isWelcomePending,
  justStartedPro,
  markWelcomePending,
  subscribeWelcome,
} from "./welcome-save";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ useEntitlement: vi.fn() }));

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
    expect(justStartedPro("pro", "pro")).toBe(false);
    expect(justStartedPro("lifetime", "pro")).toBe(false);
    expect(justStartedPro("trialing", "lapsed")).toBe(false);
    expect(justStartedPro("none", "none")).toBe(false);
  });
});

describe("welcome save flag", () => {
  beforeEach(() => store.clear());

  it("queues once per account and stays done after Home shows it", () => {
    expect(isWelcomePending("user_a")).toBe(false);
    markWelcomePending("user_a");
    expect(isWelcomePending("user_a")).toBe(true);
    finishWelcome("user_a");
    expect(isWelcomePending("user_a")).toBe(false);
    // A second purchase on the same account (lapsed, then resubscribed)
    // does not bring it back.
    markWelcomePending("user_a");
    expect(isWelcomePending("user_a")).toBe(false);
  });

  it("keeps each account separate", () => {
    markWelcomePending("user_a");
    expect(isWelcomePending("user_b")).toBe(false);
  });

  it("tells listeners when the flag changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWelcome(listener);
    markWelcomePending("user_a");
    markWelcomePending("user_a");
    finishWelcome("user_a");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    markWelcomePending("user_b");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

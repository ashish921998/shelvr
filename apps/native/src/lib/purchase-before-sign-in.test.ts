import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPurchaseBeforeSignIn,
  clearPurchaseBeforeSignIn,
  hasPurchaseBeforeSignIn,
  notePurchaseBeforeSignIn,
  PURCHASE_ATTACH_WINDOW_MS,
} from "./purchase-before-sign-in";

const store = vi.hoisted(() => new Map<string, string>());
const keychain = vi.hoisted(() => ({ failing: false }));
const captureError = vi.hoisted(() => vi.fn());

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (keychain.failing) throw new Error("keychain unavailable");
    store.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError } }));

beforeEach(() => {
  store.clear();
  keychain.failing = false;
  captureError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("purchase before sign-in", () => {
  it("lets the first account to sign in claim it and drops it for the next", () => {
    notePurchaseBeforeSignIn();
    expect(hasPurchaseBeforeSignIn()).toBe(true);

    expect(claimPurchaseBeforeSignIn("first")).toBe(true);
    expect(claimPurchaseBeforeSignIn("first")).toBe(true);
    expect(claimPurchaseBeforeSignIn("second")).toBe(false);
    expect(hasPurchaseBeforeSignIn()).toBe(false);
  });

  it("gives up the claim once the attach window has passed", () => {
    vi.useFakeTimers();
    notePurchaseBeforeSignIn();
    expect(claimPurchaseBeforeSignIn("first")).toBe(true);

    vi.advanceTimersByTime(PURCHASE_ATTACH_WINDOW_MS + 1);
    const onExpired = vi.fn();
    expect(claimPurchaseBeforeSignIn("first", onExpired)).toBe(false);
    expect(onExpired).toHaveBeenCalledOnce();
    expect(hasPurchaseBeforeSignIn()).toBe(false);
  });

  it("reports a keychain that will not write instead of throwing", () => {
    keychain.failing = true;
    notePurchaseBeforeSignIn();
    expect(captureError).toHaveBeenLastCalledWith(
      "note_purchase_before_sign_in_failed",
      expect.any(Error),
    );

    keychain.failing = false;
    notePurchaseBeforeSignIn();
    keychain.failing = true;
    expect(claimPurchaseBeforeSignIn("first")).toBe(true);
    expect(captureError).toHaveBeenLastCalledWith(
      "claim_purchase_before_sign_in_failed",
      expect.any(Error),
    );

    clearPurchaseBeforeSignIn();
    expect(captureError).toHaveBeenLastCalledWith(
      "clear_purchase_before_sign_in_failed",
      expect.any(Error),
    );
  });

  it("reports a keychain that will not stamp the attach window and keeps the claim", () => {
    notePurchaseBeforeSignIn();
    expect(claimPurchaseBeforeSignIn("first")).toBe(true);
    store.delete("shelvr.purchase.beforeSignIn.at");

    keychain.failing = true;
    expect(claimPurchaseBeforeSignIn("first")).toBe(true);
    expect(captureError).toHaveBeenLastCalledWith(
      "purchase_attach_window_failed",
      expect.any(Error),
    );
  });
});

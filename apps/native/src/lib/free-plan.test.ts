import { describe, expect, it, vi } from "vitest";
import { accessOf, canSave, type FreeSaves } from "./free-plan";

vi.mock("@/lib/entitlement", () => ({ useEntitlement: vi.fn() }));
vi.mock("@/lib/replay-onboarding", () => ({
  useAwaitingOnboardingPurchase: vi.fn(),
}));

const settled = { entitled: false, loading: false };
const free = (over: Partial<FreeSaves> = {}): FreeSaves => ({
  limit: 10,
  used: 3,
  left: 7,
  pending: 0,
  open: true,
  ...over,
});
const access = (over: Partial<Parameters<typeof accessOf>[0]> = {}) =>
  accessOf({
    signedIn: true,
    entitlement: settled,
    awaitingPurchase: false,
    freeSaves: free(),
    ...over,
  });

describe("accessOf", () => {
  it("never locks a signed-out person out", () => {
    expect(access({ signedIn: false, freeSaves: null }).kind).toBe("signedOut");
  });

  it("treats a subscriber or a purchase still landing as Pro", () => {
    expect(
      access({ entitlement: { entitled: true, loading: false } }).kind,
    ).toBe("pro");
    expect(access({ awaitingPurchase: true, freeSaves: null }).kind).toBe(
      "pro",
    );
  });

  it("waits for both the entitlement and the free saves count", () => {
    expect(access({ entitlement: { entitled: false, loading: true } })).toEqual(
      { kind: "loading" },
    );
    expect(access({ freeSaves: undefined })).toEqual({ kind: "loading" });
  });

  it("locks a person the server gives no free plan", () => {
    expect(access({ freeSaves: null })).toEqual({ kind: "locked" });
  });

  it("carries the free count through", () => {
    expect(access()).toEqual({ kind: "free", ...free() });
  });
});

describe("canSave", () => {
  it("lets Pro and a free person with saves left save", () => {
    expect(canSave({ kind: "pro" })).toBe(true);
    expect(canSave(access())).toBe(true);
  });

  it("stops a free person at zero or when the plan is closed", () => {
    expect(canSave(access({ freeSaves: free({ used: 10, left: 0 }) }))).toBe(
      false,
    );
    expect(canSave(access({ freeSaves: free({ open: false, left: 0 }) }))).toBe(
      false,
    );
    expect(canSave({ kind: "loading" })).toBe(false);
    expect(canSave({ kind: "locked" })).toBe(false);
  });
});

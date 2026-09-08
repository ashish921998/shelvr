import { describe, expect, it } from "vitest";
import { parseRevenueCatSnapshot } from "./revenuecat";

const developmentCustomer = {
  request_date_ms: Date.parse("2026-09-08T12:00:00Z"),
  subscriber: {
    entitlements: {
      shelvr_pro: {
        product_identifier: "yearly",
        expires_date: "2026-09-08T13:00:00Z",
      },
    },
    subscriptions: { yearly: { period_type: "normal" } },
  },
};

describe("RevenueCat project entitlement isolation", () => {
  it("uses the explicitly configured development entitlement", () => {
    expect(parseRevenueCatSnapshot(developmentCustomer, "shelvr_pro")).toEqual({
      status: "pro",
      productId: "yearly",
      expiresAt: Date.parse("2026-09-08T13:00:00Z"),
    });
  });
  it("does not grant production access for a different project's entitlement", () => {
    expect(parseRevenueCatSnapshot(developmentCustomer)).toEqual({ status: "lapsed", expiresAt: 0 });
  });
});

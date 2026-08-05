import { describe, expect, it } from "vitest";
import { parseRevenueCatEvent } from "./revenuecat";

describe("parseRevenueCatEvent", () => {
  it("accepts an EXPIRATION event with a null expiration timestamp", () => {
    expect(
      parseRevenueCatEvent({
        event: {
          type: "EXPIRATION",
          app_user_id: "user-1",
          expiration_at_ms: null,
          product_id: "monthly",
        },
      }),
    ).toEqual({
      type: "EXPIRATION",
      userId: "user-1",
      expiresAt: undefined,
      productId: "monthly",
    });
  });

  it("rejects other event types without an expiration timestamp", () => {
    expect(
      parseRevenueCatEvent({
        event: {
          type: "RENEWAL",
          app_user_id: "user-1",
          expiration_at_ms: null,
        },
      }),
    ).toBeUndefined();
  });
});

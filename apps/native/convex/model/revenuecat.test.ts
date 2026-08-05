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
      eventTimestampMs: undefined,
    });
  });

  it("returns other event types without an expiration timestamp (handler decides)", () => {
    // The parser returns any readable event; the HTTP handler decides whether
    // to act on it or acknowledge it. A RENEWAL with null expiration is still
    // parsed — the handler will pass expiresAt: 0 to upsert, which preserves
    // the existing row's expiry.
    expect(
      parseRevenueCatEvent({
        event: {
          type: "RENEWAL",
          app_user_id: "user-1",
          expiration_at_ms: null,
        },
      }),
    ).toEqual({
      type: "RENEWAL",
      userId: "user-1",
      expiresAt: undefined,
      productId: undefined,
      eventTimestampMs: undefined,
    });
  });
});

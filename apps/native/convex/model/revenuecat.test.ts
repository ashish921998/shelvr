import { describe, expect, it } from "vitest";
import {
  mapRevenueCatStatus,
  parseRevenueCatEvent,
  parseRevenueCatSnapshot,
} from "./revenuecat";

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
      periodType: undefined,
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
      periodType: undefined,
      eventTimestampMs: undefined,
    });
  });

  it("parses and grants RevenueCat dashboard promotional entitlements", () => {
    const event = parseRevenueCatEvent({
      event: {
        type: "NON_RENEWING_PURCHASE",
        app_user_id: "user-1",
        expiration_at_ms: 1_800_000_000_000,
        product_id: "rc_promo_pro",
        period_type: "PROMOTIONAL",
        event_timestamp_ms: 1_700_000_000_000,
      },
    });

    expect(event).toMatchObject({ periodType: "PROMOTIONAL" });
    expect(mapRevenueCatStatus(event!.type!, event!.periodType)).toBe("pro");
  });

  it("does not grant Pro for an ordinary non-renewing purchase", () => {
    expect(
      mapRevenueCatStatus("NON_RENEWING_PURCHASE", "NORMAL"),
    ).toBeUndefined();
    expect(mapRevenueCatStatus("NON_RENEWING_PURCHASE")).toBeUndefined();
  });
});

describe("billing period classification", () => {
  it.each(["NORMAL", "INTRO", undefined])(
    "records a paid first purchase as Pro (%s)",
    (period) => {
      expect(mapRevenueCatStatus("INITIAL_PURCHASE", period)).toBe("pro");
    },
  );
  it("keeps a trial until the paid renewal, including re-enabling renewal during trial", () => {
    expect(mapRevenueCatStatus("INITIAL_PURCHASE", "TRIAL")).toBe("trialing");
    expect(mapRevenueCatStatus("UNCANCELLATION", "TRIAL")).toBe("trialing");
    expect(mapRevenueCatStatus("RENEWAL", "NORMAL")).toBe("pro");
    expect(mapRevenueCatStatus("PRODUCT_CHANGE", "NORMAL")).toBeUndefined();
  });
  it("parses transfer participants without requiring app_user_id or expiration", () => {
    expect(
      parseRevenueCatEvent({
        event: {
          type: "TRANSFER",
          transferred_from: ["old", "old"],
          transferred_to: ["new"],
          event_timestamp_ms: 12,
        },
      }),
    ).toMatchObject({
      transferredFrom: ["old"],
      transferredTo: ["new"],
      eventTimestampMs: 12,
    });
  });
});

describe("RevenueCat authoritative snapshots", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const expires = "2026-09-10T12:00:00Z";
  function customer(entitlement: unknown, period = "trial") {
    return {
      request_date_ms: now,
      subscriber: {
        entitlements: { "Shelvr Pro": entitlement },
        subscriptions: { annual: { period_type: period } },
      },
    };
  }
  it("preserves a current trial and recognizes paid conversions", () => {
    const entitlement = { product_identifier: "annual", expires_date: expires };
    expect(parseRevenueCatSnapshot(customer(entitlement))).toEqual({
      status: "trialing",
      expiresAt: Date.parse(expires),
      productId: "annual",
    });
    expect(
      parseRevenueCatSnapshot(customer(entitlement, "normal")).status,
    ).toBe("pro");
  });
  it("revokes absent Pro access even if another entitlement remains", () => {
    expect(
      parseRevenueCatSnapshot({
        request_date_ms: now,
        subscriber: {
          entitlements: { unrelated: { expires_date: null } },
          subscriptions: {},
        },
      }),
    ).toEqual({ status: "lapsed", expiresAt: 0 });
  });
  it("honors a grace period and permanent entitlement", () => {
    expect(
      parseRevenueCatSnapshot(
        customer(
          {
            product_identifier: "annual",
            expires_date: "2026-09-07T12:00:00Z",
            grace_period_expires_date: expires,
          },
          "normal",
        ),
      ).status,
    ).toBe("pro");
    expect(
      parseRevenueCatSnapshot(
        customer({ product_identifier: "lifetime", expires_date: null }),
      ).status,
    ).toBe("lifetime");
  });
  it("does not turn malformed responses into revoked or lifetime access", () => {
    expect(() => parseRevenueCatSnapshot({})).toThrow();
    expect(() =>
      parseRevenueCatSnapshot(customer({ product_identifier: "annual" })),
    ).toThrow();
    expect(() =>
      parseRevenueCatSnapshot(
        customer({ product_identifier: "annual", expires_date: "invalid" }),
      ),
    ).toThrow();
  });
});

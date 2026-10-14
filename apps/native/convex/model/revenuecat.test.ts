import { describe, expect, it } from "vitest";
import {
  mapRevenueCatStatus,
  parseRevenueCatEvent,
  parseRevenueCatSnapshot,
  requiresAuthoritativeReconciliation,
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

describe("authoritative event policy", () => {
  it.each([
    [{ type: "BILLING_ISSUE" }, true],
    [{ type: "REFUND_REVERSED" }, true],
    [{ type: "CANCELLATION", cancelReason: "CUSTOMER_SUPPORT" }, true],
    [{ type: "EXPIRATION", expirationReason: "CUSTOMER_SUPPORT" }, true],
    [{ type: "CANCELLATION", cancelReason: "BILLING_ERROR" }, true],
    [{ type: "CANCELLATION", cancelReason: "UNSUBSCRIBE" }, false],
    [{ type: "EXPIRATION", expirationReason: "BILLING_ERROR" }, false],
    [{ type: "RENEWAL" }, false],
    [{}, false],
  ])("classifies %j as authoritative=%s", (event, expected) => {
    expect(requiresAuthoritativeReconciliation(event)).toBe(expected);
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

describe("RevenueCat project entitlement isolation", () => {
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

  it("uses the explicitly configured development entitlement", () => {
    expect(parseRevenueCatSnapshot(developmentCustomer, "shelvr_pro")).toEqual({
      status: "pro",
      productId: "yearly",
      expiresAt: Date.parse("2026-09-08T13:00:00Z"),
    });
  });
  it("does not grant production access for a different project's entitlement", () => {
    expect(parseRevenueCatSnapshot(developmentCustomer)).toEqual({
      status: "lapsed",
      expiresAt: 0,
    });
  });
});

// Cases below were added after a mutation-testing pass (Stryker) showed the
// suite still passed with these rules removed.
describe("rules found unguarded by mutation testing", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  function customer(entitlement: unknown, extra: Record<string, unknown> = {}) {
    return {
      request_date_ms: now,
      subscriber: {
        entitlements: { "Shelvr Pro": entitlement },
        subscriptions: { annual: { period_type: "normal" } },
      },
      ...extra,
    };
  }

  it("lapses a user on a plain EXPIRATION webhook", () => {
    expect(mapRevenueCatStatus("EXPIRATION")).toBe("lapsed");
    expect(mapRevenueCatStatus("EXPIRATION", "TRIAL")).toBe("lapsed");
  });

  it("lapses an authoritative snapshot whose expiry has passed, including exactly now", () => {
    for (const expires of ["2026-09-07T12:00:00Z", "2026-09-08T12:00:00Z"]) {
      expect(
        parseRevenueCatSnapshot(
          customer({ product_identifier: "annual", expires_date: expires }),
        ),
      ).toEqual({
        status: "lapsed",
        expiresAt: Date.parse(expires),
        productId: "annual",
      });
    }
  });

  it("lapses when the grace period has also ended", () => {
    expect(
      parseRevenueCatSnapshot(
        customer({
          product_identifier: "annual",
          expires_date: "2026-09-06T12:00:00Z",
          grace_period_expires_date: "2026-09-07T12:00:00Z",
        }),
      ).status,
    ).toBe("lapsed");
  });

  it.each([
    ["no request date", { request_date_ms: undefined }],
    ["no subscriptions", { subscriber: { entitlements: {} } }],
    ["no entitlements", { subscriber: { subscriptions: {} } }],
  ])("rejects a snapshot with %s instead of guessing access", (_, extra) => {
    expect(() =>
      parseRevenueCatSnapshot(
        customer(
          {
            product_identifier: "annual",
            expires_date: "2099-01-01T00:00:00Z",
          },
          extra,
        ),
      ),
    ).toThrow("Invalid RevenueCat customer response");
  });

  it.each([
    ["no product", { expires_date: "2099-01-01T00:00:00Z" }],
    ["an empty product", { product_identifier: "", expires_date: null }],
    ["a non-object entitlement", "annual"],
  ])("rejects a Pro entitlement with %s", (_, entitlement) => {
    expect(() => parseRevenueCatSnapshot(customer(entitlement))).toThrow(
      "Invalid RevenueCat entitlement",
    );
  });

  it("rejects a non-string expiry instead of treating it as a date", () => {
    expect(() =>
      parseRevenueCatSnapshot(
        customer({
          product_identifier: "annual",
          expires_date: 1_900_000_000_000,
        }),
      ),
    ).toThrow("Invalid RevenueCat expiry");
  });

  it.each([[null], ["event"], [42], [[]]])(
    "returns undefined for an unreadable body %j",
    (body) => {
      expect(parseRevenueCatEvent(body)).toBeUndefined();
      expect(parseRevenueCatEvent({ event: body })).toBeUndefined();
    },
  );

  it("drops fields of the wrong type or empty strings", () => {
    expect(
      parseRevenueCatEvent({
        event: {
          type: "",
          app_user_id: 7,
          expiration_at_ms: "1800000000000",
          event_timestamp_ms: Number.NaN,
          product_id: null,
        },
      }),
    ).toEqual({
      type: undefined,
      userId: undefined,
      expiresAt: undefined,
      productId: undefined,
      periodType: undefined,
      eventTimestampMs: undefined,
    });
  });

  it("only reads transfer participants on TRANSFER events", () => {
    const parsed = parseRevenueCatEvent({
      event: {
        type: "RENEWAL",
        transferred_from: ["a"],
        transferred_to: ["b"],
      },
    });
    expect(parsed).not.toHaveProperty("transferredFrom");
    expect(parsed).not.toHaveProperty("transferredTo");
  });

  it.each([
    ["a non-array", "old"],
    ["an empty id", ["old", ""]],
    ["a non-string id", ["old", 3]],
    ["more than 100 ids", Array.from({ length: 101 }, (_, i) => `u${i}`)],
  ])("rejects transfer participants given as %s", (_, from) => {
    expect(
      parseRevenueCatEvent({
        event: {
          type: "TRANSFER",
          transferred_from: from,
          transferred_to: ["new"],
        },
      })?.transferredFrom,
    ).toBeUndefined();
  });

  it("accepts exactly 100 transfer participants", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `u${i}`);
    expect(
      parseRevenueCatEvent({
        event: { type: "TRANSFER", transferred_from: ids },
      })?.transferredFrom,
    ).toEqual(ids);
  });
});

// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePaymentTelemetry } from "./model/paymentTelemetry";
import { newConvexTest } from "./test.setup";
import { internal } from "./_generated/api";

const event = {
  id: "rc-event-1",
  app_user_id: "user-1",
  product_id: "monthly",
  type: "INITIAL_PURCHASE",
  period_type: "NORMAL",
  environment: "PRODUCTION",
  purchased_at_ms: 1700000000000,
  price: 4.99,
  country_code: "IN",
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-confirmed payments", () => {
  it.each([400, 401, 403, 422])("surfaces permanent HTTP %s failures without scheduling retries", async (status) => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const t = newConvexTest();
    const payment = parsePaymentTelemetry({ event });
    if (!payment) throw new Error("Invalid test payment");
    await expect(t.action(internal.analytics.capturePayment, { payment })).rejects.toThrow(`HTTP ${status}`);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });

  it.each([429, 503])("retries HTTP %s through six delivery attempts then surfaces failure", async (status) => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const payment = parsePaymentTelemetry({ event });
    if (!payment) throw new Error("Invalid test payment");
    for (let attempt = 0; attempt < 5; attempt++) {
      await t.action(internal.analytics.capturePayment, { payment, attempt, deliveryId: "same-delivery" });
    }
    await expect(t.action(internal.analytics.capturePayment, { payment, attempt: 5, deliveryId: "same-delivery" })).rejects.toThrow(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(5);
    expect(jobs.every((job) => job.args[0].deliveryId === "same-delivery")).toBe(true);
  });

  it("retains a retry when configuration is missing and delivers after it is restored", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const payment = parsePaymentTelemetry({ event });
    if (!payment) throw new Error("Invalid test payment");
    await t.action(internal.analytics.capturePayment, { payment });
    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    await t.action(internal.analytics.capturePayment, {
      payment, attempt: 1, deliveryId: jobs[0].args[0].deliveryId,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).uuid).toBe(jobs[0].args[0].deliveryId);
  });
  it("authenticates the webhook and schedules exactly one payment alongside entitlement sync", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const body = JSON.stringify({
      event: {
        ...event,
        app_user_id: userId,
        environment: "SANDBOX",
        event_timestamp_ms: event.purchased_at_ms,
        expiration_at_ms: event.purchased_at_ms + 86400000,
      },
    });
    const rejected = await t.fetch("/webhooks/revenuecat", {
      method: "POST",
      body,
    });
    expect(rejected.status).toBe(401);
    expect(
      await t.run((ctx) => ctx.db.query("paymentAnalyticsReceipts").collect()),
    ).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      const accepted = await t.fetch("/webhooks/revenuecat", {
        method: "POST",
        body,
        headers: {
          authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
      });
      expect(accepted.status).toBe(200);
    }
    expect(
      await t.run((ctx) => ctx.db.query("paymentAnalyticsReceipts").collect()),
    ).toHaveLength(1);
    const subscriptions = await t.run((ctx) =>
      ctx.db.query("subscriptions").collect(),
    );
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].status).toBe("pro");
    expect(
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      ),
    ).toHaveLength(1);
  });

  it("closes the trial funnel end to end: cancel, redelivery dedupe, uncancel, expire", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "test-secret");
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));

    const post = async (id: string, overrides: Record<string, unknown>) => {
      const response = await t.fetch("/webhooks/revenuecat", {
        method: "POST",
        body: JSON.stringify({
          event: {
            id,
            app_user_id: userId,
            product_id: "yearly",
            environment: "SANDBOX",
            purchased_at_ms: 1700000000000,
            expiration_at_ms: 1700604800000,
            event_timestamp_ms: 1700000000000,
            ...overrides,
          },
        }),
        headers: {
          authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
      });
      expect(response.status).toBe(200);
    };

    await post("rc-1", { type: "INITIAL_PURCHASE", period_type: "TRIAL" });
    const cancellation = {
      type: "CANCELLATION",
      period_type: "TRIAL",
      cancel_reason: "UNSUBSCRIBE",
      event_timestamp_ms: 1700086400000,
    };
    await post("rc-2", cancellation);
    // RevenueCat redelivers the same webhook: exactly one receipt, one event.
    await post("rc-2", cancellation);
    await post("rc-3", {
      type: "UNCANCELLATION",
      period_type: "TRIAL",
      event_timestamp_ms: 1700090000000,
    });
    await post("rc-4", {
      type: "EXPIRATION",
      period_type: "TRIAL",
      event_timestamp_ms: 1700604800000,
    });

    expect(
      await t.run((ctx) => ctx.db.query("paymentAnalyticsReceipts").collect()),
    ).toHaveLength(4);
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs.map((job) => job.args[0].payment.event)).toEqual([
      "trial_started",
      "trial_cancelled",
      "subscription_uncancelled",
      "trial_expired",
    ]);
    expect(jobs[1].args[0].payment).toMatchObject({
      cancel_reason: "UNSUBSCRIBE",
      cancel_category: "voluntary",
    });

    const subscriptions = await t.run((ctx) =>
      ctx.db.query("subscriptions").collect(),
    );
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].status).toBe("lapsed");
  });
  it("distinguishes a free trial, trial conversion, renewal, and lifetime purchase", () => {
    expect(parsePaymentTelemetry({ event })?.event).toBe("payment_succeeded");
    const trial = parsePaymentTelemetry({
      event: { ...event, period_type: "TRIAL", price: 0 },
    });
    expect(trial?.event).toBe("trial_started");
    expect(trial).not.toHaveProperty("revenue_usd");
    expect(
      parsePaymentTelemetry({
        event: { ...event, type: "RENEWAL", is_trial_conversion: true },
      })?.payment_kind,
    ).toBe("trial_conversion");
    expect(
      parsePaymentTelemetry({ event: { ...event, type: "RENEWAL" } })
        ?.payment_kind,
    ).toBe("renewal");
    expect(
      parsePaymentTelemetry({
        event: { ...event, type: "NON_RENEWING_PURCHASE" },
      })?.payment_kind,
    ).toBe("one_time");
    expect(
      parsePaymentTelemetry({ event: { ...event, environment: "SANDBOX" } })
        ?.environment,
    ).toBe("sandbox");
  });

  it.each([
    { type: "TRANSFER" },
    { type: "RESTORE" },
    // Lifecycle types need a usable event_timestamp_ms to emit; these
    // malformed fixtures must be skipped (positive cases below).
    { type: "CANCELLATION", event_timestamp_ms: undefined },
    { type: "EXPIRATION", event_timestamp_ms: undefined },
    { type: "UNCANCELLATION", event_timestamp_ms: undefined },
    { type: "CANCELLATION", period_type: "TRIAL", event_timestamp_ms: 0 },
    { type: "CANCELLATION", period_type: "TRIAL", event_timestamp_ms: NaN },
    { price: 0 },
    { price: -4.99 },
    { price: undefined },
    { price: NaN },
    { period_type: "PROMOTIONAL" },
    { is_family_share: true },
    { environment: undefined },
    { id: "" },
    { purchased_at_ms: undefined },
  ])("does not count nonpayments or malformed payloads: %j", (patch) => {
    expect(
      parsePaymentTelemetry({ event: { ...event, ...patch } }),
    ).toBeUndefined();
  });

  it("deduplicates webhook delivery independently of entitlement ordering", async () => {
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const payment = parsePaymentTelemetry({
      event: { ...event, app_user_id: userId },
    });
    if (!payment) throw new Error("Invalid fixture");
    await t.mutation(internal.paymentTelemetry.enqueue, { payment });
    await t.mutation(internal.paymentTelemetry.enqueue, { payment });
    await t.mutation(internal.paymentTelemetry.enqueue, {
      payment: {
        ...payment,
        eventId: "older-payment",
        timestamp: payment.timestamp - 1000,
      },
    });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.args[0].payment.eventId)).toEqual([
      "rc-event-1",
      "older-payment",
    ]);
  });

  it("ignores unknown or deleted accounts", async () => {
    const t = newConvexTest();
    const payment = parsePaymentTelemetry({ event });
    if (!payment) throw new Error("Invalid fixture");
    await t.mutation(internal.paymentTelemetry.enqueue, { payment });
    expect(
      await t.run((ctx) => ctx.db.query("paymentAnalyticsReceipts").collect()),
    ).toHaveLength(0);
  });

  it("keeps the purchase timestamp and UUID on retry and labels sandbox charges separately", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://analytics.example");
    vi.stubEnv("OBSERVABILITY_ENV", "production");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const payment = parsePaymentTelemetry({
      event: { ...event, environment: "SANDBOX" },
    });
    if (!payment) throw new Error("Invalid fixture");
    await t.action(internal.analytics.capturePayment, { payment });
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(first.properties.environment).toBe("sandbox");
    expect(first.timestamp).toBe(new Date(event.purchased_at_ms).toISOString());
    expect(first.properties.revenue_usd).toBe(4.99);
    await t.action(internal.analytics.capturePayment, jobs[0].args[0]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(first);
  });

  it("delivers cancellation events with their reason classification and leaves purchase bodies unchanged", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("OBSERVABILITY_ENV", "production");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const cancelled = parsePaymentTelemetry({
      event: {
        ...event,
        type: "CANCELLATION",
        period_type: "TRIAL",
        event_timestamp_ms: 1700000100000,
        cancel_reason: "UNSUBSCRIBE",
      },
    });
    if (!cancelled) throw new Error("Invalid test fixture");
    await t.action(internal.analytics.capturePayment, { payment: cancelled });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      event: "trial_cancelled",
      timestamp: new Date(1700000100000).toISOString(),
    });
    expect(body.properties).toMatchObject({
      distinct_id: "user-1",
      store_environment: "production",
      payment_kind: "trial",
      cancel_reason: "UNSUBSCRIBE",
      cancel_category: "voluntary",
    });
    expect(body.properties).not.toHaveProperty("revenue_usd");
    const purchase = parsePaymentTelemetry({ event });
    if (!purchase) throw new Error("Invalid test fixture");
    await t.action(internal.analytics.capturePayment, { payment: purchase });
    const purchaseBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(purchaseBody.properties).not.toHaveProperty("cancel_reason");
    expect(purchaseBody.properties).not.toHaveProperty("cancel_category");
  });
});

describe("cancellation lifecycle telemetry", () => {
  const cancelledAtMs = 1700000100000;
  const lifecycle = {
    ...event,
    type: "CANCELLATION",
    period_type: "TRIAL",
    event_timestamp_ms: cancelledAtMs,
    cancel_reason: "UNSUBSCRIBE",
  };

  it("emits trial_cancelled at the lifecycle moment with a voluntary category", () => {
    const parsed = parsePaymentTelemetry({ event: lifecycle });
    expect(parsed).toMatchObject({
      eventId: "rc-event-1",
      userId: "user-1",
      event: "trial_cancelled",
      timestamp: cancelledAtMs,
      environment: "production",
      product_id: "monthly",
      payment_kind: "trial",
      country_code: "IN",
      cancel_reason: "UNSUBSCRIBE",
      cancel_category: "voluntary",
    });
    expect(parsed).not.toHaveProperty("revenue_usd");
  });

  it.each([
    ["UNSUBSCRIBE", "voluntary"],
    ["PRICE_INCREASE", "voluntary"],
    ["CUSTOMER_SUPPORT", "refund"],
    ["BILLING_ERROR", "billing"],
    ["DEVELOPER_INITIATED", "developer"],
    ["UNKNOWN", "unknown"],
  ] as const)(
    "classifies cancel_reason %s as %s",
    (reason, category) => {
      expect(
        parsePaymentTelemetry({
          event: { ...lifecycle, cancel_reason: reason },
        }),
      ).toMatchObject({
        event: "trial_cancelled",
        cancel_reason: reason,
        cancel_category: category,
      });
    },
  );

  it("labels a cancellation without a reason unknown and omits cancel_reason", () => {
    const parsed = parsePaymentTelemetry({
      event: { ...lifecycle, cancel_reason: undefined },
    });
    expect(parsed).toMatchObject({
      event: "trial_cancelled",
      cancel_category: "unknown",
    });
    expect(parsed).not.toHaveProperty("cancel_reason");
  });

  it("emits subscription_cancelled for non-trial cancellations", () => {
    expect(
      parsePaymentTelemetry({
        event: { ...lifecycle, period_type: "NORMAL" },
      }),
    ).toMatchObject({
      event: "subscription_cancelled",
      payment_kind: "subscription",
      cancel_category: "voluntary",
    });
  });

  it("emits trial_expired for a lapsed unconverted trial only", () => {
    const parsed = parsePaymentTelemetry({
      event: { ...lifecycle, type: "EXPIRATION" },
    });
    expect(parsed).toMatchObject({
      event: "trial_expired",
      payment_kind: "trial_lapsed",
      timestamp: cancelledAtMs,
    });
    expect(parsed).not.toHaveProperty("cancel_category");
    expect(
      parsePaymentTelemetry({
        event: { ...lifecycle, type: "EXPIRATION", period_type: "NORMAL" },
      }),
    ).toBeUndefined();
  });

  it("emits subscription_uncancelled with the period split in payment_kind", () => {
    expect(
      parsePaymentTelemetry({
        event: { ...lifecycle, type: "UNCANCELLATION" },
      }),
    ).toMatchObject({
      event: "subscription_uncancelled",
      payment_kind: "trial",
    });
    expect(
      parsePaymentTelemetry({
        event: { ...lifecycle, type: "UNCANCELLATION", period_type: "NORMAL" },
      }),
    ).toMatchObject({
      event: "subscription_uncancelled",
      payment_kind: "subscription",
    });
  });
});

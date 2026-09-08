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
  it("distinguishes a free trial, trial conversion, renewal, and lifetime purchase", () => {
    expect(parsePaymentTelemetry({ event })?.event).toBe("payment_succeeded");
    const trial = parsePaymentTelemetry({
      event: { ...event, period_type: "TRIAL", price: 0 },
    });
    expect(trial?.event).toBe("trial_started");
    expect(trial?.revenue_usd).toBeUndefined();
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
    { type: "UNCANCELLATION" },
    { type: "TRANSFER" },
    { type: "CANCELLATION" },
    { type: "EXPIRATION" },
    { type: "RESTORE" },
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

  it("keeps the purchase timestamp and UUID on delivery retry, excluding sandbox revenue", async () => {
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
});

import { v } from "convex/values";

import { readPositiveNumber, readRecord, readString } from "./revenuecat";

export const paymentTelemetryValidator = v.object({
  eventId: v.string(),
  userId: v.string(),
  event: v.union(v.literal("trial_started"), v.literal("payment_succeeded")),
  timestamp: v.number(),
  environment: v.union(v.literal("production"), v.literal("sandbox")),
  product_id: v.string(),
  payment_kind: v.string(),
  revenue_usd: v.optional(v.number()),
  country_code: v.optional(v.string()),
});

// RevenueCat webhook payloads are untyped JSON, so every field passes through
// the shared guards from model/revenuecat.ts before it reaches the telemetry
// row. Keeping one copy of the guards prevents the two parsers from
// drifting apart.

function parseEnvironment(
  value: unknown,
): "production" | "sandbox" | undefined {
  if (value === "PRODUCTION") return "production";
  if (value === "SANDBOX") return "sandbox";
  return undefined;
}

// Event types that represent revenue; every other webhook type is lifecycle
// noise the telemetry must not count.
const PAID_EVENT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
];

type PaymentClassification = {
  event: "trial_started" | "payment_succeeded";
  payment_kind: string;
  revenue_usd?: number;
};

/** Classify an event as a trial start or a paid purchase. Returns undefined
 * for lifecycle events, trial-priced renewals, and price-less purchases. */
function classifyPayment(
  data: Record<string, unknown>,
): PaymentClassification | undefined {
  const type = typeof data.type === "string" ? data.type : "";
  const periodType =
    typeof data.period_type === "string" ? data.period_type : "";
  if (type === "INITIAL_PURCHASE" && periodType === "TRIAL") {
    return { event: "trial_started", payment_kind: "trial" };
  }
  if (
    periodType === "TRIAL" ||
    periodType === "PROMOTIONAL" ||
    !PAID_EVENT_TYPES.includes(type)
  ) {
    return;
  }
  const revenueUsd = readPositiveNumber(data.price);
  if (revenueUsd === undefined) return;
  const paymentKind =
    type === "RENEWAL"
      ? data.is_trial_conversion === true
        ? "trial_conversion"
        : "renewal"
      : type === "NON_RENEWING_PURCHASE"
        ? "one_time"
        : "initial";
  return {
    event: "payment_succeeded",
    payment_kind: paymentKind,
    revenue_usd: revenueUsd,
  };
}

export function parsePaymentTelemetry(body: unknown) {
  const payload = readRecord(body);
  const event = readRecord(payload?.event);
  if (!payload || !event) return;
  const data: Record<string, unknown> = { ...event };
  const eventId = readString(data.id);
  const userId = readString(data.app_user_id);
  const productId = readString(data.product_id);
  const environment = parseEnvironment(data.environment);
  const timestamp = readPositiveNumber(data.purchased_at_ms);
  if (!eventId || !userId || !productId || !environment || !timestamp) return;
  if (data.is_family_share === true) return;
  const paid = classifyPayment(data);
  if (!paid) return;
  return {
    eventId,
    userId,
    event: paid.event,
    timestamp,
    environment,
    product_id: productId,
    payment_kind: paid.payment_kind,
    ...(paid.revenue_usd !== undefined
      ? { revenue_usd: paid.revenue_usd }
      : {}),
    ...(typeof data.country_code === "string"
      ? { country_code: data.country_code }
      : {}),
  };
}

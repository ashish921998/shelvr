import { v } from "convex/values";

import { readPositiveNumber, readRecord, readString } from "./revenuecat";

export const paymentTelemetryValidator = v.object({
  eventId: v.string(),
  userId: v.string(),
  event: v.union(
    v.literal("trial_started"),
    v.literal("payment_succeeded"),
    v.literal("trial_cancelled"),
    v.literal("subscription_cancelled"),
    v.literal("trial_expired"),
    v.literal("subscription_uncancelled"),
  ),
  timestamp: v.number(),
  environment: v.union(v.literal("production"), v.literal("sandbox")),
  product_id: v.string(),
  payment_kind: v.string(),
  revenue_usd: v.optional(v.number()),
  country_code: v.optional(v.string()),
  // Cancellation events only. `cancel_reason` is the verbatim RevenueCat
  // enum; `cancel_category` is the derived classification used by dashboards.
  cancel_reason: v.optional(v.string()),
  cancel_category: v.optional(
    v.union(
      v.literal("voluntary"),
      v.literal("refund"),
      v.literal("billing"),
      v.literal("developer"),
      v.literal("unknown"),
    ),
  ),
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

export type CancelCategory =
  | "voluntary"
  | "refund"
  | "billing"
  | "developer"
  | "unknown";

/**
 * Classification of RevenueCat `cancel_reason` values (docs:
 * webhooks → "Cancellation and Expiration Reasons").
 * - `CUSTOMER_SUPPORT` means a support refund — auto-renew may still be ON,
 *   so a refund "cancellation" can be followed by continued payments. It is
 *   its own category, never folded into voluntary.
 * - `UNKNOWN` (Apple didn't say) and absent reasons fall back to `unknown`.
 */
const CANCEL_CATEGORIES: Record<string, CancelCategory> = {
  UNSUBSCRIBE: "voluntary",
  PRICE_INCREASE: "voluntary",
  CUSTOMER_SUPPORT: "refund",
  BILLING_ERROR: "billing",
  DEVELOPER_INITIATED: "developer",
};

function cancelCategory(reason: unknown): CancelCategory {
  // Object.hasOwn, not `in`: a crafted `cancel_reason` like "constructor"
  // would pass `in` (inherited property) and leak the inherited value as
  // the category — which the enqueue validator would then reject, dropping
  // the entire webhook event. Own-property check falls back to `unknown`.
  return typeof reason === "string" && Object.hasOwn(CANCEL_CATEGORIES, reason)
    ? CANCEL_CATEGORIES[reason]
    : "unknown";
}

type LifecycleEvent =
  | "trial_cancelled"
  | "subscription_cancelled"
  | "trial_expired"
  | "subscription_uncancelled";

/** Map RevenueCat lifecycle webhook types to their telemetry event and
 * payment_kind together — they are one decision. `EXPIRATION` only counts
 * for trials (a lapsed unconverted trial); paid expirations are not part of
 * the trial funnel. `UNCANCELLATION` fires for paid subscriptions too, so it
 * keeps a general name and `payment_kind` carries the trial/subscription
 * split. */
function lifecyclePayment(
  type: unknown,
  periodType: unknown,
): { event: LifecycleEvent; payment_kind: string } | undefined {
  if (type === "CANCELLATION") {
    return periodType === "TRIAL"
      ? { event: "trial_cancelled", payment_kind: "trial" }
      : { event: "subscription_cancelled", payment_kind: "subscription" };
  }
  if (type === "EXPIRATION" && periodType === "TRIAL") {
    return { event: "trial_expired", payment_kind: "trial_lapsed" };
  }
  if (type === "UNCANCELLATION") {
    return {
      event: "subscription_uncancelled",
      payment_kind: periodType === "TRIAL" ? "trial" : "subscription",
    };
  }
  return undefined;
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
  if (!eventId || !userId || !productId || !environment) return;
  if (data.is_family_share === true) return;
  if (data.period_type === "PROMOTIONAL") return;

  const lifecycle = lifecyclePayment(data.type, data.period_type);

  // Lifecycle events timestamp the lifecycle moment (`event_timestamp_ms`);
  // purchases keep `purchased_at_ms` per the existing contract.
  const timestamp = readPositiveNumber(
    lifecycle ? data.event_timestamp_ms : data.purchased_at_ms,
  );
  if (!timestamp) return;

  if (lifecycle) {
    const cancelled =
      lifecycle.event === "trial_cancelled" ||
      lifecycle.event === "subscription_cancelled";
    return {
      eventId,
      userId,
      event: lifecycle.event,
      timestamp,
      environment,
      product_id: productId,
      payment_kind: lifecycle.payment_kind,
      ...(typeof data.country_code === "string"
        ? { country_code: data.country_code }
        : {}),
      ...(cancelled
        ? {
            cancel_category: cancelCategory(data.cancel_reason),
            ...(typeof data.cancel_reason === "string" && data.cancel_reason
              ? { cancel_reason: data.cancel_reason }
              : {}),
          }
        : {}),
    };
  }

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

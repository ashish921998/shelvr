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

function parseEnvironment(
  value: unknown,
): "production" | "sandbox" | undefined {
  if (value === "PRODUCTION") return "production";
  if (value === "SANDBOX") return "sandbox";
  return undefined;
}

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

type CancelCategory =
  | "voluntary"
  | "refund"
  | "billing"
  | "developer"
  | "unknown";

// CUSTOMER_SUPPORT is a refund: auto-renew may stay on, so it is never voluntary.
const CANCEL_CATEGORIES: Record<string, CancelCategory> = {
  UNSUBSCRIBE: "voluntary",
  PRICE_INCREASE: "voluntary",
  CUSTOMER_SUPPORT: "refund",
  BILLING_ERROR: "billing",
  DEVELOPER_INITIATED: "developer",
};

function cancelCategory(reason: unknown): CancelCategory {
  return typeof reason === "string" && Object.hasOwn(CANCEL_CATEGORIES, reason)
    ? (CANCEL_CATEGORIES[reason] ?? "unknown")
    : "unknown";
}

type LifecycleEvent =
  | "trial_cancelled"
  | "subscription_cancelled"
  | "trial_expired"
  | "subscription_uncancelled";

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

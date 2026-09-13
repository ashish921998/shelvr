import { v } from "convex/values";

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
  return typeof reason === "string" && reason in CANCEL_CATEGORIES
    ? CANCEL_CATEGORIES[reason]
    : "unknown";
}

type LifecycleEvent =
  | "trial_cancelled"
  | "subscription_cancelled"
  | "trial_expired"
  | "subscription_uncancelled";

/** Map RevenueCat lifecycle webhook types to cancellation telemetry events.
 * `EXPIRATION` only counts for trials (a lapsed unconverted trial); paid
 * expirations are not part of the trial funnel. `UNCANCELLATION` fires for
 * paid subscriptions too, so it keeps a general name and `payment_kind`
 * carries the trial/subscription split. */
function lifecycleEvent(
  type: unknown,
  periodType: unknown,
): LifecycleEvent | undefined {
  if (type === "CANCELLATION")
    return periodType === "TRIAL"
      ? "trial_cancelled"
      : "subscription_cancelled";
  if (type === "EXPIRATION" && periodType === "TRIAL") return "trial_expired";
  if (type === "UNCANCELLATION") return "subscription_uncancelled";
  return undefined;
}

export function parsePaymentTelemetry(body: unknown) {
  if (!body || typeof body !== "object" || !("event" in body)) return;
  const event = body.event;
  if (!event || typeof event !== "object") return;
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(event),
  );
  const {
    id,
    app_user_id,
    product_id,
    environment,
    type,
    period_type,
    price,
    purchased_at_ms,
    event_timestamp_ms,
    cancel_reason,
  } = data;
  if (
    typeof id !== "string" ||
    !id ||
    typeof app_user_id !== "string" ||
    !app_user_id ||
    typeof product_id !== "string" ||
    !product_id ||
    (environment !== "PRODUCTION" && environment !== "SANDBOX") ||
    data.is_family_share === true ||
    period_type === "PROMOTIONAL"
  )
    return;

  const storeEnvironment =
    environment === "PRODUCTION" ? ("production" as const) : ("sandbox" as const);
  const lifecycle = lifecycleEvent(type, period_type);

  // Lifecycle events timestamp the lifecycle moment (`event_timestamp_ms`);
  // purchases keep `purchased_at_ms` per the existing contract.
  const timestamp = lifecycle ? event_timestamp_ms : purchased_at_ms;
  if (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  )
    return;

  if (lifecycle) {
    const cancelled =
      lifecycle === "trial_cancelled" || lifecycle === "subscription_cancelled";
    return {
      eventId: id,
      userId: app_user_id,
      event: lifecycle,
      timestamp,
      environment: storeEnvironment,
      product_id,
      payment_kind:
        lifecycle === "trial_cancelled"
          ? "trial"
          : lifecycle === "trial_expired"
            ? "trial_lapsed"
            : lifecycle === "subscription_cancelled"
              ? "subscription"
              : period_type === "TRIAL"
                ? "trial"
                : "subscription",
      ...(typeof data.country_code === "string"
        ? { country_code: data.country_code }
        : {}),
      ...(cancelled
        ? {
            ...(typeof cancel_reason === "string" && cancel_reason
              ? { cancel_reason }
              : {}),
            cancel_category: cancelCategory(cancel_reason),
          }
        : {}),
    };
  }

  const trial = type === "INITIAL_PURCHASE" && period_type === "TRIAL";
  const paid =
    ["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"].includes(
      String(type),
    ) &&
    period_type !== "TRIAL" &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0;
  if (!trial && !paid) return;

  return {
    eventId: id,
    userId: app_user_id,
    event: trial ? ("trial_started" as const) : ("payment_succeeded" as const),
    timestamp: purchased_at_ms as number,
    environment: storeEnvironment,
    product_id,
    payment_kind: trial
      ? "trial"
      : type === "RENEWAL"
        ? data.is_trial_conversion === true
          ? "trial_conversion"
          : "renewal"
        : type === "NON_RENEWING_PURCHASE"
          ? "one_time"
          : "initial",
    ...(paid ? { revenue_usd: price as number } : {}),
    ...(typeof data.country_code === "string"
      ? { country_code: data.country_code }
      : {}),
  };
}

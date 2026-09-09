import { v } from "convex/values";

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
  } = data;
  if (
    typeof id !== "string" ||
    !id ||
    typeof app_user_id !== "string" ||
    !app_user_id ||
    typeof product_id !== "string" ||
    !product_id ||
    (environment !== "PRODUCTION" && environment !== "SANDBOX") ||
    typeof purchased_at_ms !== "number" ||
    !Number.isFinite(purchased_at_ms) ||
    purchased_at_ms <= 0 ||
    data.is_family_share === true ||
    period_type === "PROMOTIONAL"
  )
    return;

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
    timestamp: purchased_at_ms,
    environment:
      environment === "PRODUCTION"
        ? ("production" as const)
        : ("sandbox" as const),
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

export type RevenueCatEvent = {
  type?: string;
  userId?: string;
  expiresAt?: number;
  productId?: string;
  periodType?: string;
  eventTimestampMs?: number;
};

/** Parse the subset of a RevenueCat webhook used by the entitlement sync.
 * Returns `undefined` only when the body is not a readable object — the caller
 * then returns HTTP 400. A readable event missing `type` or `app_user_id`
 * returns a partial object with those fields as `undefined` so the caller can
 * respond HTTP 200 (acknowledging the event so RevenueCat stops retrying)
 * without acting on it. `expiresAt` is optional for all event types; the
 * handler decides what to do when it's missing.
 */
export function parseRevenueCatEvent(
  body: unknown,
): RevenueCatEvent | undefined {
  const event = readRecord(readRecord(body)?.event);
  if (event === undefined) return undefined;

  const type = readString(event?.type);
  const userId = readString(event?.app_user_id);
  const expiresAt = readNumber(event?.expiration_at_ms);
  const productId = readString(event?.product_id);
  const periodType = readString(event?.period_type);
  const eventTimestampMs = readNumber(event?.event_timestamp_ms);

  return { type, userId, expiresAt, productId, periodType, eventTimestampMs };
}

/** Map RevenueCat lifecycle events to Shelvr's server-side entitlement state.
 * Dashboard-granted entitlements arrive as NON_RENEWING_PURCHASE events with
 * a PROMOTIONAL period. Treat only that combination as Pro; ordinary
 * non-renewing purchases remain advisory so a consumable can never unlock the
 * subscription gate.
 */
export function mapRevenueCatStatus(
  type: string,
  periodType?: string,
): "trialing" | "pro" | "lapsed" | undefined {
  switch (type) {
    case "INITIAL_PURCHASE":
    case "TRIAL_STARTED":
      return "trialing";
    case "TRIAL_CONVERTED":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      return "pro";
    case "EXPIRATION":
      return "lapsed";
    case "NON_RENEWING_PURCHASE":
      return periodType === "PROMOTIONAL" ? "pro" : undefined;
    default:
      return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

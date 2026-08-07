export type RevenueCatEvent = {
  type?: string;
  userId?: string;
  expiresAt?: number;
  productId?: string;
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
  const eventTimestampMs = readNumber(event?.event_timestamp_ms);

  return { type, userId, expiresAt, productId, eventTimestampMs };
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

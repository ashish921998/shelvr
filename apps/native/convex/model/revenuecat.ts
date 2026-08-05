export type RevenueCatEvent = {
  type: string;
  userId: string;
  expiresAt?: number;
  productId?: string;
};

/** Parse the subset of a RevenueCat webhook used by the entitlement sync.
 * EXPIRATION is the only event accepted without an expiration timestamp: in
 * that case the handler lapses the existing row while retaining its period end.
 */
export function parseRevenueCatEvent(
  body: unknown,
): RevenueCatEvent | undefined {
  const event = readRecord(readRecord(body)?.event);
  const type = readString(event?.type);
  const userId = readString(event?.app_user_id);
  const expiresAt = readNumber(event?.expiration_at_ms);
  const productId = readString(event?.product_id);

  if (type === undefined || userId === undefined) return undefined;
  if (
    expiresAt === undefined &&
    !(type === "EXPIRATION" && event?.expiration_at_ms === null)
  ) {
    return undefined;
  }
  return { type, userId, expiresAt, productId };
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

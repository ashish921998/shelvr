export type RevenueCatEvent = {
  type?: string;
  userId?: string;
  expiresAt?: number;
  productId?: string;
  periodType?: string;
  cancelReason?: string;
  expirationReason?: string;
  eventTimestampMs?: number;
  transferredFrom?: string[];
  transferredTo?: string[];
};

/** Parse the subset of a RevenueCat webhook used by the entitlement sync.
 * Returns `undefined` only when the body is not a readable object: the caller
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

  const type = readString(event.type);
  const userId = eventOwner(
    readString(event.app_user_id),
    readStringArray(event.aliases),
  );
  const expiresAt = readNumber(event.expiration_at_ms);
  const productId = readString(event.product_id);
  const periodType = readString(event.period_type);
  const eventTimestampMs = readNumber(event.event_timestamp_ms);

  return {
    type,
    userId,
    expiresAt,
    productId,
    periodType,
    cancelReason: readString(event.cancel_reason),
    expirationReason: readString(event.expiration_reason),
    eventTimestampMs,
    ...(type === "TRANSFER"
      ? {
          transferredFrom: readStringArray(event.transferred_from),
          transferredTo: readStringArray(event.transferred_to),
        }
      : {}),
  };
}

const ANONYMOUS_PREFIX = "$RCAnonymousID:";

/** A purchase made before sign-in is keyed to RevenueCat's anonymous id. Once
 * the account signs in, `logIn` makes that id an alias of the account's own,
 * so an event still keyed to the anonymous id belongs to that account. An
 * anonymous id with no such alias stays as it is, and owns nothing here. */
function eventOwner(
  appUserId: string | undefined,
  aliases: string[] | undefined,
): string | undefined {
  if (!appUserId?.startsWith(ANONYMOUS_PREFIX)) return appUserId;
  return aliases?.find((id) => !id.startsWith(ANONYMOUS_PREFIX)) ?? appUserId;
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
    case "RENEWAL":
    case "UNCANCELLATION":
      return periodType === "TRIAL" ? "trialing" : "pro";
    case "EXPIRATION":
      return "lapsed";
    case "NON_RENEWING_PURCHASE":
      return periodType === "PROMOTIONAL" ? "pro" : undefined;
    default:
      return undefined;
  }
}

/** Events whose current access must come from RevenueCat, not the webhook body. */
export function requiresAuthoritativeReconciliation(
  event: RevenueCatEvent,
): boolean {
  switch (event.type) {
    case "BILLING_ISSUE":
    case "REFUND_REVERSED":
      return true;
    case "NON_RENEWING_PURCHASE":
      // A dashboard grant. A lifetime one carries no expiry, which the
      // webhook path would read as "nothing to record"; the snapshot reports
      // its real end, or none for lifetime.
      return event.periodType === "PROMOTIONAL";
    case "CANCELLATION":
      // A failed charge sends BILLING_ERROR with the already-past expiry; only
      // the snapshot knows the billing grace window. A cancelled dashboard
      // grant may be a sticky lifetime row, as under EXPIRATION.
      return (
        event.cancelReason === "CUSTOMER_SUPPORT" ||
        event.cancelReason === "BILLING_ERROR" ||
        event.periodType === "PROMOTIONAL"
      );
    case "EXPIRATION":
      // A revoked dashboard grant may have been stored as a sticky lifetime
      // row, which only an authoritative snapshot can lapse.
      return (
        event.expirationReason === "CUSTOMER_SUPPORT" ||
        event.periodType === "PROMOTIONAL"
      );
    default:
      return false;
  }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  if (
    !value.every(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    )
  )
    return undefined;
  return [...new Set(value)];
}

type RevenueCatSnapshot = {
  status: "trialing" | "pro" | "lapsed" | "lifetime";
  expiresAt: number;
  productId?: string;
};

/** Read only the project's Pro entitlement; malformed responses must not revoke access.
 * Billing grace is honoured only from this authoritative snapshot, never the webhook body.
 */
export function parseRevenueCatSnapshot(
  body: unknown,
  entitlementIdentifier = "Shelvr Pro",
): RevenueCatSnapshot {
  const response = readRecord(body);
  const subscriber = readRecord(response?.subscriber);
  const entitlements = readRecord(subscriber?.entitlements);
  const subscriptions = readRecord(subscriber?.subscriptions);
  const now = readNumber(response?.request_date_ms);
  if (!entitlements || !subscriptions || now === undefined) {
    throw new Error("Invalid RevenueCat customer response");
  }
  if (!(entitlementIdentifier in entitlements))
    return { status: "lapsed", expiresAt: 0 };
  const entitlement = readRecord(entitlements[entitlementIdentifier]);
  const productId = readString(entitlement?.product_identifier);
  if (!entitlement || !productId)
    throw new Error("Invalid RevenueCat entitlement");
  if (entitlement.expires_date === null)
    return { status: "lifetime", expiresAt: 0, productId };
  const expiresAt = parseDate(entitlement.expires_date);
  const grace = entitlement.grace_period_expires_date;
  const effectiveExpiry =
    grace == null ? expiresAt : Math.max(expiresAt, parseDate(grace));
  const subscription = readRecord(subscriptions[productId]);
  return {
    status:
      effectiveExpiry <= now
        ? "lapsed"
        : subscription?.period_type === "trial"
          ? "trialing"
          : "pro",
    expiresAt: effectiveExpiry,
    productId,
  };
}

function parseDate(value: unknown): number {
  const date = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(date)) throw new Error("Invalid RevenueCat expiry");
  return date;
}

// Shared guards for untyped RevenueCat webhook payloads; paymentTelemetry.ts
// reuses them so the two parsers cannot drift apart.
export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A finite number strictly greater than zero (prices, millisecond stamps). */
export function readPositiveNumber(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

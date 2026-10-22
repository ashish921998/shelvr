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

export function parseRevenueCatEvent(
  body: unknown,
): RevenueCatEvent | undefined {
  const event = readRecord(readRecord(body)?.event);
  if (event === undefined) return undefined;

  const type = readString(event.type);
  const userId = readString(event.app_user_id);
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

export function requiresAuthoritativeReconciliation(
  event: RevenueCatEvent,
): boolean {
  switch (event.type) {
    case "BILLING_ISSUE":
    case "REFUND_REVERSED":
      return true;
    case "NON_RENEWING_PURCHASE":
      return event.periodType === "PROMOTIONAL";
    case "CANCELLATION":
      return (
        event.cancelReason === "CUSTOMER_SUPPORT" ||
        event.cancelReason === "BILLING_ERROR" ||
        event.periodType === "PROMOTIONAL"
      );
    case "EXPIRATION":
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

export function readPositiveNumber(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

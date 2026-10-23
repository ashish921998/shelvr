export type RevenueCatEvent = {
  type?: string;
  userId?: string;
  expiresAt?: number;
  productId?: string;
  periodType?: string;
  store?: string;
  appId?: string;
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
    store: readString(event.store),
    appId: readString(event.app_id),
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

/** The production project's Test Store app. RevenueCat may leave `store` out of an event, but not `app_id`. */
const PRODUCTION_TEST_STORE_APP_ID = "app20ea108057";

export function isTestStoreEvent(event: RevenueCatEvent): boolean {
  return (
    isTestStore(event.store) || event.appId === PRODUCTION_TEST_STORE_APP_ID
  );
}

/** Webhook events spell it TEST_STORE, the REST API test_store. */
function isTestStore(store: unknown): boolean {
  return typeof store === "string" && store.toLowerCase() === "test_store";
}

const ANONYMOUS_PREFIX = "$RCAnonymousID:";

/** RevenueCat's `logIn` makes the anonymous id of a pre-sign-in purchase an alias of the account's own. */
function eventOwner(
  appUserId: string | undefined,
  aliases: string[] | undefined,
): string | undefined {
  if (!appUserId?.startsWith(ANONYMOUS_PREFIX)) return appUserId;
  return aliases?.find((id) => !id.startsWith(ANONYMOUS_PREFIX)) ?? appUserId;
}

/** Dashboard-granted entitlements arrive as NON_RENEWING_PURCHASE events with a PROMOTIONAL period. */
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

function isDashboardGrant(event: RevenueCatEvent): boolean {
  return event.periodType === "PROMOTIONAL";
}

export function requiresAuthoritativeReconciliation(
  event: RevenueCatEvent,
): boolean {
  switch (event.type) {
    case "BILLING_ISSUE":
    case "REFUND_REVERSED":
      return true;
    case "NON_RENEWING_PURCHASE":
      // A lifetime dashboard grant carries no expiry.
      return isDashboardGrant(event);
    case "CANCELLATION":
      // A failed charge sends BILLING_ERROR with the already-past expiry; only the snapshot knows the billing grace window.
      return (
        event.cancelReason === "CUSTOMER_SUPPORT" ||
        event.cancelReason === "BILLING_ERROR" ||
        isDashboardGrant(event)
      );
    case "EXPIRATION":
      return (
        event.expirationReason === "CUSTOMER_SUPPORT" || isDashboardGrant(event)
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
  { acceptTestStore = false }: { acceptTestStore?: boolean } = {},
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
  if (!acceptTestStore && fromTestStore(subscriber, productId))
    return { status: "lapsed", expiresAt: 0 };
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

function fromTestStore(
  subscriber: Record<string, unknown> | undefined,
  productId: string,
): boolean {
  const subscription = readRecord(
    readRecord(subscriber?.subscriptions)?.[productId],
  );
  if (subscription) return isTestStore(subscription.store);
  const purchases = readRecord(subscriber?.non_subscriptions)?.[productId];
  return (
    Array.isArray(purchases) &&
    purchases.some((purchase) => isTestStore(readRecord(purchase)?.store))
  );
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

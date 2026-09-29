import { useEffect } from "react";
import {
  analytics,
  type PaywallContext,
  type TrialEligibility,
} from "@/lib/analytics";
import { getPurchases } from "@/lib/revenuecat-module";

/**
 * The paywall funnel's in-session memory and RevenueCat context reads.
 *
 * A purchase is observed in one place (the sheet's promise), the entitlement
 * row it should produce in another (the Convex query), and a blocked action's
 * later completion in a third (whichever component mounted the guard). This
 * module is the one home for that state, so the funnel reads as one story
 * instead of three loose globals scattered through `entitlement.ts`. All of
 * it is in-session, one action deep, and dropped on sign-out.
 */

// ---------------------------------------------------------------------------
// Entitlement activation
// ---------------------------------------------------------------------------

/** The entitled statuses an `entitlement_activated` event may report. */
type ActiveEntitlementStatus = "trialing" | "pro" | "lifetime";

/** A purchase or restore that succeeded in this session and is waiting for
 * the Convex entitlement row to show it. */
let pendingAccess: { source: "purchase" | "restore"; at: number } | null = null;

/** The entitled status the client currently sees, or null. */
let activeEntitlementStatus: ActiveEntitlementStatus | null = null;

function captureEntitlementActivation(
  source: "purchase" | "restore",
  at: number,
  status: ActiveEntitlementStatus,
): void {
  analytics.capture("entitlement_activated", {
    status,
    source,
    delay_ms: Math.max(0, Date.now() - at),
  });
}

/** Records a purchase or restore that just succeeded natively, so its
 * `entitlement_activated` event fires when the Convex entitlement row becomes
 * visible. The webhook can win the race with the native promise — when it
 * does, the row is already visible and the event fires immediately. */
export function recordAccess(source: "purchase" | "restore"): void {
  const at = Date.now();
  if (activeEntitlementStatus !== null) {
    captureEntitlementActivation(source, at, activeEntitlementStatus);
    return;
  }
  pendingAccess = { source, at };
}

/** True when the client already sees an entitled status, so a Profile restore
 * that finds an active entitlement has nothing new to report. */
export function hasActiveEntitlement(): boolean {
  return activeEntitlementStatus !== null;
}

/**
 * Fires `entitlement_activated` once per recorded purchase or restore: the
 * RevenueCat webhook has written the Convex `subscriptions` row and the
 * client's query now shows it. A purchase whose query update raced the native
 * promise is captured by `recordAccess` instead. Mount once beside the
 * entitlement query (in `useEntitlementSync`).
 */
export function useEntitlementActivation(
  activeStatus: ActiveEntitlementStatus | null,
): void {
  useEffect(() => {
    activeEntitlementStatus = activeStatus;
    if (activeStatus === null || pendingAccess === null) return;
    const access = pendingAccess;
    pendingAccess = null;
    captureEntitlementActivation(access.source, access.at, activeStatus);
  }, [activeStatus]);
}

/** Drops every funnel memory. The memory belongs to the account that earned
 * it: a sign-out or account change must never report one person's purchase as
 * the next person's activation. */
export function forgetPaywallFunnel(): void {
  pendingAccess = null;
  blockedAction = null;
  activeEntitlementStatus = null;
}

// ---------------------------------------------------------------------------
// Blocked actions
// ---------------------------------------------------------------------------

/** The gated action a paywall call did not complete, so its later completion
 * through the guard can be measured. In-session only, and one action deep: a
 * new block replaces it. */
let blockedAction: {
  placement: string;
  at: number;
  purchased: boolean;
} | null = null;

/** A blocked action older than this no longer counts as resumed — the person
 * came back for their own reasons, not to finish the blocked step. */
const BLOCKED_ACTION_RESUME_MS = 30 * 60_000;

/** Records that a paywall at `placement` blocked a gated action, and whether
 * the sheet resolved in a purchase or restore before the caller got control
 * back. */
export function recordBlockedAction(
  placement: string,
  purchased: boolean,
): void {
  blockedAction = { placement, at: Date.now(), purchased };
}

/** Reports a gated action that later went through after a paywall block at
 * the same placement, then clears the memory — one resumed event per block. */
export function resumeBlockedAction(placement: string): void {
  const blocked = blockedAction;
  if (blocked === null || blocked.placement !== placement) return;
  blockedAction = null;
  const now = Date.now();
  if (now - blocked.at > BLOCKED_ACTION_RESUME_MS) return;
  analytics.capture("paywall_blocked_action_resumed", {
    placement,
    delay_ms: now - blocked.at,
    purchased_since_block: blocked.purchased,
  });
}

// ---------------------------------------------------------------------------
// Paywall context reads
// ---------------------------------------------------------------------------

/** The SDK's intro-eligibility enum, reached through the lazy module handle
 * so this module keeps no static import of the native package. */
type IntroEligibilityStatuses = NonNullable<
  ReturnType<typeof getPurchases>
>["INTRO_ELIGIBILITY_STATUS"];

/** Folds the offering's per-product intro-eligibility answers into the one
 * bounded word the funnel reports: any eligible product makes the offering
 * eligible; an offering where every answer says no intro offer exists reports
 * `no_intro`; any ineligible answer reports `ineligible`; anything else —
 * missing answers included — reports `unknown`. */
function foldTrialEligibility(
  statuses: (number | undefined)[],
  intro: IntroEligibilityStatuses,
): TrialEligibility {
  // An offering with no products has no answer to fold.
  if (statuses.length === 0) return "unknown";
  if (statuses.includes(intro.INTRO_ELIGIBILITY_STATUS_ELIGIBLE)) {
    return "eligible";
  }
  if (
    statuses.every(
      (status) =>
        status === intro.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS,
    )
  ) {
    return "no_intro";
  }
  if (statuses.includes(intro.INTRO_ELIGIBILITY_STATUS_INELIGIBLE)) {
    return "ineligible";
  }
  return "unknown";
}

/** Reads the paywall context from RevenueCat's caches. Both calls are cache
 * reads in practice, but the timeout caps the worst case so a cold SDK can
 * never hold the sheet open for them. Empty when anything is unavailable —
 * the events carry no guess. */
const PAYWALL_CONTEXT_TIMEOUT_MS = 2_000;

export async function readPaywallContext(): Promise<PaywallContext> {
  const rc = getPurchases();
  if (!rc) return {};
  const read = async (): Promise<PaywallContext> => {
    const offerings = await rc.getOfferings();
    const offering = offerings.current;
    if (!offering) return {};
    const products = offering.availablePackages.map(
      (pkg) => pkg.product.identifier,
    );
    const eligibility =
      await rc.checkTrialOrIntroductoryPriceEligibility(products);
    const statuses = products.map((id) => eligibility[id]?.status);
    return {
      offering_id: offering.identifier,
      trial_eligible: foldTrialEligibility(
        statuses,
        rc.INTRO_ELIGIBILITY_STATUS,
      ),
    };
  };
  return withTimeout(read(), PAYWALL_CONTEXT_TIMEOUT_MS);
}

/** Resolves to `{}` when `read` rejects or outlasts `ms`, so a stalled SDK
 * call can never hold up the paywall flow for a telemetry property. */
async function withTimeout<T extends object>(
  read: Promise<T>,
  ms: number,
): Promise<T | Record<string, never>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<Record<string, never>>((resolve) => {
        timer = setTimeout(() => resolve({}), ms);
      }),
    ]);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** The store product behind the now-active entitlement, read right after a
 * purchase or restore resolves. Best-effort: the customer info is fresh at
 * that moment, but a slow refresh resolves to no `product_id` rather than a
 * guess. */
export async function activeProductId(): Promise<{ product_id?: string }> {
  const rc = getPurchases();
  if (!rc) return {};
  const read = async (): Promise<{ product_id?: string }> => {
    const info = await rc.getCustomerInfo();
    const entitlement = Object.values(info.entitlements.active)[0];
    return entitlement?.productIdentifier
      ? { product_id: entitlement.productIdentifier }
      : {};
  };
  // Bounded: the purchase result waits on this read before it reaches the
  // caller, so a stalled SDK call must not hold up the unlocked action.
  return withTimeout(read(), PAYWALL_CONTEXT_TIMEOUT_MS);
}

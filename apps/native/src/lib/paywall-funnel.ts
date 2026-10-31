import { useEffect } from "react";
import {
  analytics,
  type PaywallContext,
  type TrialEligibility,
} from "@/lib/analytics";
import { trialTimelineVariables, type TrialPeriod } from "@/lib/date";
import { formattingLocale, t } from "@/lib/i18n";
import { getPurchases } from "@/lib/revenuecat-module";
import { restoreFoundAccess } from "@/lib/paywall-result";
import { goalPaywallVariables, type GoalProgress } from "@/lib/paywall-goal";
import {
  trialReminderAt,
  trialReminderLeadDays,
} from "@/lib/trial-reminder-lead";

type ActiveEntitlementStatus = "trialing" | "pro" | "lifetime";

let pendingAccess: { source: "purchase" | "restore"; at: number } | null = null;

let activeEntitlementStatus: ActiveEntitlementStatus | null = null;

let customerInfoReadAt = 0;

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

export function recordAccess(source: "purchase" | "restore"): void {
  const at = Date.now();
  if (activeEntitlementStatus !== null) {
    captureEntitlementActivation(source, at, activeEntitlementStatus);
    return;
  }
  pendingAccess = { source, at };
}

export function hasActiveEntitlement(): boolean {
  return activeEntitlementStatus !== null;
}

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

export function forgetPaywallFunnel(): void {
  pendingAccess = null;
  customerInfoReadAt = 0;
  blockedAction = null;
  activeEntitlementStatus = null;
}

let blockedAction: {
  placement: string;
  at: number;
  purchased: boolean;
} | null = null;

const BLOCKED_ACTION_RESUME_MS = 30 * 60_000;

export function recordBlockedAction(
  placement: string,
  purchased: boolean,
): void {
  blockedAction = { placement, at: Date.now(), purchased };
}

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

type IntroEligibilityStatuses = NonNullable<
  ReturnType<typeof getPurchases>
>["INTRO_ELIGIBILITY_STATUS"];

function foldTrialEligibility(
  statuses: (number | undefined)[],
  intro: IntroEligibilityStatuses,
): TrialEligibility {
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

const PAYWALL_CONTEXT_TIMEOUT_MS = 2_000;

export async function readPaywallContext(): Promise<PaywallContext> {
  const rc = getPurchases();
  if (!rc) return {};
  const startedAt = Date.now();
  const { offering } = await withTimeout(
    rc.getOfferings().then((offerings) => ({ offering: offerings.current })),
    PAYWALL_CONTEXT_TIMEOUT_MS,
  );
  if (!offering) return {};
  const ids = offering.availablePackages.map((pkg) => pkg.product.identifier);
  const eligibility = await withTimeout(
    rc.checkTrialOrIntroductoryPriceEligibility(ids).then((answers) => ({
      trial_eligible: foldTrialEligibility(
        ids.map((id) => answers[id]?.status),
        rc.INTRO_ELIGIBILITY_STATUS,
      ),
    })),
    Math.max(0, PAYWALL_CONTEXT_TIMEOUT_MS - (Date.now() - startedAt)),
  );
  return { offering_id: offering.identifier, ...eligibility };
}

export const NO_TRIAL_OFFERING_ID = "weekly_annual_draft";

/** Placements with an offering of their own: `winback` carries the promo offers, `intro` the paid intro products. */
const PLACEMENT_OFFERING_IDS: Record<string, string> = {
  winback: "winback",
  intro: "intro",
};

export async function readPaywallOffering(placement?: string): Promise<{
  offering?: import("react-native-purchases").PurchasesOffering;
  trial?: TrialPeriod;
  eligibility?: TrialEligibility;
}> {
  const rc = getPurchases();
  if (!rc) return {};
  const startedAt = Date.now();
  const offerings = await withTimeout(
    rc.getOfferings(),
    PAYWALL_CONTEXT_TIMEOUT_MS,
  );
  const placed =
    placement === undefined
      ? undefined
      : offerings.all[PLACEMENT_OFFERING_IDS[placement] ?? ""];
  // Until RevenueCat has the placement's offering, the default paywall shows.
  if (placed) return { offering: placed };
  const current = offerings.current;
  if (!current) return {};
  const products = current.availablePackages.map((pkg) => pkg.product);
  const noTrial = offerings.all[NO_TRIAL_OFFERING_ID];
  if (noTrial && noTrial.identifier !== current.identifier) {
    const ids = products.map((product) => product.identifier);
    const { eligibility } = await withTimeout(
      rc.checkTrialOrIntroductoryPriceEligibility(ids).then((answers) => ({
        eligibility: foldTrialEligibility(
          ids.map((id) => answers[id]?.status),
          rc.INTRO_ELIGIBILITY_STATUS,
        ),
      })),
      Math.max(0, PAYWALL_CONTEXT_TIMEOUT_MS - (Date.now() - startedAt)),
    );
    if (eligibility === "ineligible") return { offering: noTrial, eligibility };
    return {
      offering: current,
      trial: singleTrialPeriod(products),
      ...(eligibility && { eligibility }),
    };
  }
  return {
    offering: current,
    trial: singleTrialPeriod(products),
  };
}

export function paywallVariables(
  now: number,
  trial: TrialPeriod | undefined,
  products: TrialOfferProduct[],
  eligibility: TrialEligibility | undefined,
  onboarding?: GoalProgress,
) {
  const variables = {
    ...(trial &&
      trialTimelineVariables(now, trial, (end) =>
        trialReminderAt(end, now, trialReminderLeadDays()),
      )),
    ...trialOfferVariables(products, eligibility),
    ...(onboarding && goalPaywallVariables(onboarding)),
  };
  return Object.keys(variables).length > 0 ? variables : undefined;
}

type TrialOfferProduct = {
  priceString: string;
  currencyCode: string;
  subscriptionPeriod: string | null;
  introPrice: { price: number } | null;
};

export function trialOfferVariables(
  products: TrialOfferProduct[],
  eligibility: TrialEligibility | undefined,
): Record<string, { type: "string"; value: string }> {
  const yearly = products.find(
    (p) => p.subscriptionPeriod === "P1Y" && p.introPrice?.price === 0,
  );
  if (eligibility !== "eligible" || !yearly) return {};
  const zero = new Intl.NumberFormat(formattingLocale(), {
    style: "currency",
    currency: yearly.currencyCode,
  }).format(0);
  const value = t("paywall.trialOffer", { zero, price: yearly.priceString });
  return { trial_offer: { type: "string", value } };
}

export function singleTrialPeriod(
  products: {
    introPrice: {
      price: number;
      periodUnit: string;
      periodNumberOfUnits: number;
    } | null;
  }[],
): TrialPeriod | undefined {
  const trials = products.flatMap(({ introPrice }) =>
    introPrice?.price === 0
      ? [{ unit: introPrice.periodUnit, count: introPrice.periodNumberOfUnits }]
      : [],
  );
  const [first] = trials;
  return first &&
    trials.every((t) => t.unit === first.unit && t.count === first.count)
    ? first
    : undefined;
}

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
  return withTimeout(read(), PAYWALL_CONTEXT_TIMEOUT_MS);
}

const CUSTOMER_INFO_TIMEOUT_MS = 10_000;
const CUSTOMER_INFO_FRESH_MS = 60_000;

/**
 * True once RevenueCat answers a fresh customer info read. presentPaywallIfNeeded
 * then checks Pro against current data, not a cache from before a lapse, and it
 * never settles when its own read fails, so a failed read here keeps it closed.
 * A read that landed within the last minute, even after its caller gave up, is
 * kept, so a retry on a slow connection does not throw it away.
 */
export async function refreshCustomerInfo(): Promise<boolean> {
  const rc = getPurchases();
  if (!rc) return false;
  const read = async (): Promise<{ read?: true }> => {
    const stale = Date.now() - customerInfoReadAt >= CUSTOMER_INFO_FRESH_MS;
    if (stale) await rc.invalidateCustomerInfoCache();
    await rc.getCustomerInfo();
    if (stale) customerInfoReadAt = Date.now();
    return { read: true };
  };
  return (await withTimeout(read(), CUSTOMER_INFO_TIMEOUT_MS)).read === true;
}

/**
 * RevenueCat's sheet resolves RESTORED once Restore was tapped, even when
 * nothing was found. True only when customer info loads and shows no
 * entitlement: a failed or slow read keeps the SDK's word, so a real restore
 * is never mistaken for an empty one.
 */
export async function restoreCameBackEmpty(): Promise<boolean> {
  const rc = getPurchases();
  if (!rc) return false;
  const read = async (): Promise<{ empty?: boolean }> => ({
    empty: !restoreFoundAccess(await rc.getCustomerInfo()),
  });
  return (await withTimeout(read(), PAYWALL_CONTEXT_TIMEOUT_MS)).empty === true;
}

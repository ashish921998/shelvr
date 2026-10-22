import { revenueCatLocale, syncRevenueCatUILocale } from "./revenuecat-locale";
import { api } from "@convex/_generated/api";
import { isEntitled } from "@convex/model/entitlement";
import { convexQuery } from "@convex-dev/react-query";
import { useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/current-user";
import { analytics } from "@/lib/analytics";
import {
  activeProductId,
  forgetPaywallFunnel,
  hasActiveEntitlement,
  paywallVariables,
  readPaywallContext,
  readPaywallOffering,
  recordAccess,
  recordBlockedAction,
  restoreCameBackEmpty,
  resumeBlockedAction,
  useEntitlementActivation,
} from "@/lib/paywall-funnel";
import { getRCUI, getPurchases } from "@/lib/revenuecat-module";
import { observePaywallPresentation } from "@/lib/paywall-telemetry";
import { randomUUID } from "expo-crypto";
import {
  mapPaywallResult,
  shouldOpenPaywallFallback,
  type PaywallOutcome,
} from "@/lib/paywall-result";
import {
  readFreshTrialCancellation,
  type TrialCancellationState,
} from "@/lib/trial-cancellation";
import {
  REVENUECAT_API_KEY,
  REVENUECAT_DISABLED_BY_BUILD,
} from "@/lib/revenuecat-api-key";
import { startRevenueCatIdentitySync } from "./revenuecat-identity-sync";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { isProHiddenForE2E } from "@/lib/e2e-hide-pro";
import { reservePurchaseLanding } from "@/lib/purchase-landing";

export type EntitlementStatus =
  | "trialing"
  | "pro"
  | "lapsed"
  | "lifetime"
  | "none";

export type Entitlement = {
  status: EntitlementStatus;
  entitled: boolean;
  loading: boolean;
  now: number;
  expiresAt?: number;
};

let _rcTargetUserId: string | null = null;
let _rcSyncedUserId: string | null = null;
let _rcIdentitySync = Promise.resolve();

const SYNC_READY_TIMEOUT_MS = 5000;

function setRcTargetUserId(userId: string | null) {
  if (_rcTargetUserId === userId) return;
  _rcTargetUserId = userId;
  _rcSyncedUserId = null;
}

function markRcUserSynced(userId: string) {
  if (_rcTargetUserId !== userId) return;
  _rcSyncedUserId = userId;
}

function isRcSyncReady() {
  return _rcTargetUserId !== null && _rcSyncedUserId === _rcTargetUserId;
}

async function awaitRcSyncReady(): Promise<boolean> {
  if (isRcSyncReady()) return true;
  return Promise.race([
    _rcIdentitySync.then(() => isRcSyncReady()),
    new Promise<boolean>((r) =>
      setTimeout(() => r(false), SYNC_READY_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Delay before presenting RevenueCat UI after a sheet/stack transition. UIKit
 * refuses to present while a dismiss is mid-flight ("already presenting
 * RNSScreen"), so callers `router.back()` / complete a transition first, then
 * await this. One home for the magic number so it can't drift between screens.
 */
const SHEET_SETTLE_MS = 600;

export function waitForSheetTransition(): Promise<void> {
  return new Promise((r) => setTimeout(r, SHEET_SETTLE_MS));
}

let configured = false;

async function configureRevenueCat(appUserID: string): Promise<void> {
  if (configured) return;
  const rc = getPurchases();
  if (!rc) throw new Error("revenuecat_module_unavailable");
  if (!REVENUECAT_API_KEY) throw new Error("revenuecat_key_missing");
  await rc.configure({
    apiKey: REVENUECAT_API_KEY,
    appUserID,
    preferredUILocaleOverride: revenueCatLocale(),
  });
  configured = true;
}

export function useEntitlementSync(): void {
  const { isAuthenticated } = useConvexAuth();
  const { data: user } = useCurrentUser();
  const sub = isAuthenticated ? (user?._id ?? null) : null;
  const entitlement = useEntitlement();
  const activeStatus =
    entitlement.entitled &&
    (entitlement.status === "trialing" ||
      entitlement.status === "pro" ||
      entitlement.status === "lifetime")
      ? entitlement.status
      : null;

  useEffect(() => {
    setRcTargetUserId(sub);
    if (sub === null) {
      forgetPaywallFunnel();
      return;
    }
    if (REVENUECAT_DISABLED_BY_BUILD) return;

    let cancelled = false;
    const observer = startRevenueCatIdentitySync({
      sync: () => {
        const attempt = _rcIdentitySync.then(async () => {
          if (cancelled || _rcTargetUserId !== sub) return;
          await configureRevenueCat(sub);
          if (cancelled || _rcTargetUserId !== sub) return;
          const rc = getPurchases();
          if (!rc) throw new Error("revenuecat_module_unavailable");
          await rc.logIn(sub);
        });
        _rcIdentitySync = attempt.catch(() => {});
        return attempt;
      },
      onReady: () => markRcUserSynced(sub),
      onError: reportRevenueCatIdentityError,
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") observer.retry();
    });

    return () => {
      cancelled = true;
      observer.dispose();
      subscription.remove();
      if (_rcTargetUserId === sub) setRcTargetUserId(null);
    };
  }, [sub]);

  useEntitlementActivation(activeStatus);
}

function reportRevenueCatIdentityError(error: unknown) {
  let reason = "revenuecat_identity_sync_failed";
  if (
    error instanceof Error &&
    ["revenuecat_module_unavailable", "revenuecat_key_missing"].includes(
      error.message,
    )
  ) {
    reason = error.message;
  } else if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (/^\d{1,3}$/.test(code)) reason = `revenuecat_error_${code}`;
  }
  analytics.captureError("purchase_identity_sync_failed", error, { reason });
}

export function useEntitlement(): Entitlement {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data } = useQuery(
    convexQuery(
      api.subscriptions.getEntitlement,
      isAuthenticated ? {} : "skip",
    ),
  );
  const [now, setNow] = useState(() => Date.now());
  const hasExpiry = data?.expiresAt !== undefined;
  useEffect(() => {
    if (!hasExpiry) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [hasExpiry]);

  if (isAuthenticated && isProHiddenForE2E()) {
    return { status: "none", entitled: false, loading: false, now };
  }
  if (!isAuthenticated) {
    return { status: "none", entitled: false, loading: authLoading, now };
  }
  if (!data || data.status === "none") {
    return {
      status: "none",
      entitled: false,
      loading: data === undefined,
      now,
    };
  }
  const expiresAt = data.expiresAt;
  const active = isEntitled(data.status, expiresAt, now);
  return {
    status: active ? data.status : "lapsed",
    entitled: active,
    loading: false,
    now,
    expiresAt,
  };
}

async function presentPaywallImpl(
  placement = "pro_gate",
): Promise<PaywallOutcome> {
  const properties = { placement, paywall_attempt_id: randomUUID() };
  const requestedAt = Date.now();
  const owner = openSheet;
  analytics.capture("paywall_requested", properties);
  const context = readPaywallContext();
  const failed = (reason: string) =>
    analytics.capture("paywall_failed", {
      ...properties,
      reason,
      duration_ms: Math.max(0, Date.now() - requestedAt),
    });
  if (!(await awaitRcSyncReady())) {
    failed("identity_not_ready");
    return "unavailable";
  }

  const rcui = getRCUI();
  if (!rcui) {
    failed("sdk_unavailable");
    return "unavailable";
  }
  if (!(await syncRevenueCatUILocale(getPurchases()))) {
    failed("locale_sync_failed");
    return "unavailable";
  }
  try {
    const { offering, trial, eligibility } = await readPaywallOffering();
    const enriched = {
      ...properties,
      ...(await context),
      ...(offering && { offering_id: offering.identifier }),
      ...(eligibility && { trial_eligible: eligibility }),
    };
    const customVariables = paywallVariables(
      Date.now(),
      trial,
      offering?.availablePackages.map((pkg) => pkg.product) ?? [],
      enriched.trial_eligible,
    );
    const result = await observePaywallPresentation(
      enriched,
      () =>
        nativePresentation(owner, () =>
          rcui.presentPaywall({ offering, customVariables }),
        ).then(confirmRestore),
      activeProductId,
    );
    if (result === "PURCHASED" || result === "RESTORED") {
      recordAccess(result === "RESTORED" ? "restore" : "purchase");
    }
    return mapPaywallResult(result);
  } catch {
    return "unavailable";
  }
}

async function confirmRestore(result: string): Promise<string> {
  if (result !== "RESTORED") return result;
  return (await restoreCameBackEmpty()) ? "CANCELLED" : result;
}

const SHEET_STALE_MS = 5 * 60_000;

const NATIVE_SHOW_MS = 2000;

type OpenSheet = {
  startedAt: number;
  paywall: Promise<PaywallOutcome> | null;
  nativeSince?: number;
  abandon?: () => void;
};
let openSheet: OpenSheet | null = null;
let lastAppTouchAt = 0;

/**
 * Called by the app root on every touch React Native handles (not the native
 * tab bar or native menus, which never reach it). UIKit can refuse a presentation
 * (another sheet mid-transition) without ever settling RevenueCat's promise,
 * which would hold the latch and swallow every paywall tap for minutes.
 * This relies on the native paywall covering the app: a screen presented
 * over it without a tap (a share intent, a deep link) would let touches
 * through and drop a sheet that is up.
 */
export function noteAppTouch(): void {
  lastAppTouchAt = Date.now();
}

function nativePresentation<T>(
  sheet: OpenSheet | null,
  present: () => Promise<T>,
): Promise<T> {
  if (sheet) sheet.nativeSince = Date.now();
  return present().finally(() => {
    if (sheet) sheet.nativeSince = undefined;
  });
}

function liveSheet(): OpenSheet | null {
  if (openSheet && Date.now() - openSheet.startedAt < SHEET_STALE_MS) {
    const since = openSheet.nativeSince;
    if (since === undefined || lastAppTouchAt < since + NATIVE_SHOW_MS) {
      return openSheet;
    }
    openSheet.abandon?.();
    releaseSheet(openSheet);
    return null;
  }
  openSheet = null;
  return null;
}

const sheetWaiters = new Set<() => void>();

function releaseSheet(sheet: OpenSheet): void {
  if (openSheet !== sheet) return;
  openSheet = null;
  const waiters = [...sheetWaiters];
  sheetWaiters.clear();
  for (const waiter of waiters) waiter();
}

export function whenSheetSettled(): Promise<void> {
  return new Promise((resolve) => {
    const live = liveSheet();
    if (!live) {
      setTimeout(resolve, SHEET_SETTLE_MS);
      return;
    }
    const onRelease = () => {
      clearTimeout(stale);
      setTimeout(resolve, SHEET_SETTLE_MS);
    };
    const stale = setTimeout(
      () => {
        sheetWaiters.delete(onRelease);
        resolve();
      },
      SHEET_STALE_MS - (Date.now() - live.startedAt),
    );
    sheetWaiters.add(onRelease);
  });
}

export function isPaywallPending(): boolean {
  return liveSheet() !== null;
}

type Presentation = { outcome: PaywallOutcome; owned: boolean };

async function presentPaywall(placement = "pro_gate"): Promise<Presentation> {
  // iOS presents one sheet at a time. A second presentation raced against a
  // live one leaves both RevenueCat promises unsettled, so neither reports an
  // outcome and the user sees at most one paywall. The `share` placement
  // shipped 6 presentations and 2 outcomes this way. A duplicate caller joins
  const live = liveSheet();
  if (live) {
    const outcome = live.paywall ? await live.paywall : "cancelled";
    return { outcome, owned: false };
  }
  const sheet: OpenSheet = { startedAt: Date.now(), paywall: null };
  const abandoned = new Promise<PaywallOutcome>((resolve) => {
    sheet.abandon = () => resolve("cancelled");
  });
  openSheet = sheet;
  const landing = reservePurchaseLanding();
  sheet.paywall = Promise.race([presentPaywallImpl(placement), abandoned])
    .then((outcome) => {
      if (outcome === "success") landing();
      return outcome;
    })
    .finally(() => {
      releaseSheet(sheet);
    });
  return { outcome: await sheet.paywall, owned: true };
}

/**
 * Present the RevenueCat paywall. On real unavailability (SDK not linked, sync
 * timed out, ERROR), fall back to the paywall route. On cancellation, return
 * to the caller without routing: cancel must not look like an outage. Returns
 * `true` only on purchase/restore. Shared by every Pro-gated affordance.
 */
export async function openPaywall(
  router: ReturnType<typeof useRouter>,
  placement = "pro_gate",
): Promise<boolean> {
  const { outcome, owned } = await presentPaywall(placement);
  if (owned && shouldOpenPaywallFallback(outcome)) {
    router.push("/(app)/paywall");
  }
  recordBlockedAction(placement, outcome === "success");
  return outcome === "success";
}

export async function openPaywallOutcome(
  router: ReturnType<typeof useRouter>,
  placement: string,
): Promise<PaywallOutcome> {
  const { outcome, owned } = await presentPaywall(placement);
  if (
    owned &&
    shouldOpenPaywallFallback(outcome) &&
    placement !== "onboarding"
  ) {
    router.push("/(app)/paywall");
  }
  recordBlockedAction(placement, outcome === "success");
  return outcome;
}

/**
 * Present the RevenueCat Customer Center natively (sheet on iOS), where the
 * user can manage their subscription: change plan, request a refund (iOS),
 * restore purchases, cancel, or open a configured deeplink/URL. Like the
 * paywall, this is NOT presented until RC identity sync is ready: management
 * actions (restore, refund, plan change) must be attributed to the signed-in
 * Convex user so the webhook's `app_user_id` matches.
 *
 * Returns `true` if the Customer Center sheet was presented at all (regardless
 * of what the user did inside it); `false` if the RC UI SDK isn't linked or
 * identity sync didn't complete in time. Callers should hide the "manage"
 * affordance or fall back to a help link when this returns `false`.
 *
 * Requires `react-native-purchases-ui` >= 8.7.0 and Customer Center to be
 * configured in the RevenueCat dashboard (Project Settings → Customer Center).
 */
export async function presentCustomerCenter(): Promise<boolean> {
  if (liveSheet()) return false;
  const sheet: OpenSheet = { startedAt: Date.now(), paywall: null };
  openSheet = sheet;
  try {
    if (!(await awaitRcSyncReady())) return false;

    const rcui = getRCUI();
    if (!rcui || typeof rcui.presentCustomerCenter !== "function") return false;
    if (!(await syncRevenueCatUILocale(getPurchases()))) return false;
    try {
      await rcui.presentCustomerCenter();
      return true;
    } catch {
      return false;
    }
  } finally {
    releaseSheet(sheet);
  }
}

type RestorePurchasesOutcome = "restored" | "none" | "unavailable";

export async function restorePurchases(): Promise<RestorePurchasesOutcome> {
  const landing = reservePurchaseLanding();
  if (!(await awaitRcSyncReady())) return "unavailable";

  const rc = getPurchases();
  if (!rc) return "unavailable";
  try {
    const customerInfo = await rc.restorePurchases();
    if (Object.keys(customerInfo.entitlements.active).length === 0)
      return "none";
    if (!hasActiveEntitlement()) recordAccess("restore");
    landing();
    return "restored";
  } catch {
    return "unavailable";
  }
}

export async function readRcTrialCancellation(): Promise<TrialCancellationState> {
  if (!(await awaitRcSyncReady())) return "unknown";
  const rc = getPurchases();
  if (!rc) return "unknown";
  return await readFreshTrialCancellation(rc);
}

export async function readTrialEligible(): Promise<boolean> {
  if (!(await awaitRcSyncReady())) return false;
  try {
    return (await readPaywallContext()).trial_eligible === "eligible";
  } catch {
    return false;
  }
}

/**
 * Returns a guard that runs `action` only when the user is entitled, otherwise
 * presents the RevenueCat paywall (native sheet). If the RC UI SDK isn't linked
 * or the paywall is unavailable, falls back to routing to the paywall route.
 * A user cancellation returns to the current screen. Use this at every
 * Pro-gated affordance (Save, dynamic spaces,
 * Find links, Tidy, Map) so the paywall appears at a moment of felt need rather
 * than blocking the whole app. The server re-checks entitlement on every gated
 * mutation, so this client guard is advisory only.
 *
 * While entitlement is loading, the guard returns `false` without acting.
 * Callers should disable the affordance or show a loading state. The hook also
 * returns `loading` so callers can read it without a second `useEntitlement`.
 */
export function usePaywallGuard(placement = "pro_gate"): {
  guard: (action?: () => void) => Promise<boolean>;
  loading: boolean;
} {
  const { entitled, loading } = useEntitlement();
  const router = useRouter();
  const guard = useCallback(
    async (action?: () => void) => {
      if (loading) return false;
      if (entitled) {
        resumeBlockedAction(placement);
        action?.();
        return true;
      }
      await openPaywall(router, placement);
      return false;
    },
    [entitled, loading, placement, router],
  );
  return { guard, loading };
}

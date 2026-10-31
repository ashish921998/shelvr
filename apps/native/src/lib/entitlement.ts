import { revenueCatLocale, syncRevenueCatUILocale } from "./revenuecat-locale";
import { api } from "@convex/_generated/api";
import { isEntitled } from "@convex/model/entitlement";
import { convexQuery } from "@convex-dev/react-query";
import { useAction, useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/current-user";
import { analytics } from "@/lib/analytics";
import { getOnboardingProgress } from "@/lib/pending-onboarding";
import {
  activeProductId,
  forgetPaywallFunnel,
  hasActiveEntitlement,
  paywallVariables,
  readPaywallContext,
  readPaywallOffering,
  refreshCustomerInfo,
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
  REVENUECAT_PRO_ENTITLEMENT,
} from "@/lib/revenuecat-api-key";
import { startRevenueCatIdentitySync } from "./revenuecat-identity-sync";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isProHiddenForE2E } from "@/lib/e2e-hide-pro";
import {
  claimPurchaseBeforeSignIn,
  clearPurchaseBeforeSignIn,
} from "@/lib/purchase-before-sign-in";
import {
  notePurchaseLanding,
  readPurchaseLanding,
  reservePurchaseLanding,
  subscribePurchaseLanding,
} from "@/lib/purchase-landing";

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
let _rcAnonymousReady = false;
let _rcSignedOut = false;
const ANONYMOUS_PLACEMENT = "onboarding";

const SYNC_READY_TIMEOUT_MS = 5000;

function setRcTargetUserId(userId: string | null) {
  if (_rcTargetUserId === userId) return;
  _rcTargetUserId = userId;
  _rcSyncedUserId = null;
  _rcAnonymousReady = false;
}

function setRcSignedOut(signedOut: boolean) {
  if (_rcSignedOut === signedOut) return;
  _rcSignedOut = signedOut;
  _rcAnonymousReady = false;
}

function markRcUserSynced(userId: string) {
  if (_rcTargetUserId !== userId) return;
  _rcSyncedUserId = userId;
}

function isRcSyncReady() {
  return _rcTargetUserId !== null && _rcSyncedUserId === _rcTargetUserId;
}

function rcReadyFor(anonymous: boolean) {
  return anonymous
    ? _rcTargetUserId === null && _rcAnonymousReady
    : isRcSyncReady();
}

// Before logIn, RevenueCat attributes purchases to an anonymous user the webhook cannot map.
async function awaitRcSyncReady(anonymous = false): Promise<boolean> {
  const ready = () => rcReadyFor(anonymous);
  if (ready()) return true;
  return Promise.race([
    _rcIdentitySync.then(ready),
    new Promise<boolean>((r) =>
      setTimeout(() => r(false), SYNC_READY_TIMEOUT_MS),
    ),
  ]);
}

// UIKit refuses to present while a dismiss is mid-flight ("already presenting RNSScreen").
const SHEET_SETTLE_MS = 600;

export function waitForSheetTransition(): Promise<void> {
  return new Promise((r) => setTimeout(r, SHEET_SETTLE_MS));
}

let configured = false;

async function configureRevenueCat(
  appUserID: string | undefined,
): Promise<void> {
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

/** Mount once at the app root: logs RevenueCat in as the Convex user id, which the webhook keys on. */
export function useEntitlementSync(): void {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useCurrentUser();
  const sub = isAuthenticated ? (user?._id ?? null) : null;
  const signedOut = !isAuthenticated && !isLoading;
  const syncPurchase = useAction(api.subscriptions.syncPurchase);
  const syncPurchaseRef = useRef(syncPurchase);
  useEffect(() => {
    syncPurchaseRef.current = syncPurchase;
  });
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
    setRcSignedOut(signedOut);
    if (sub === null) {
      forgetPaywallFunnel();
      return;
    }
    if (REVENUECAT_DISABLED_BY_BUILD) return;

    let cancelled = false;
    const claimed = claimPurchaseBeforeSignIn(sub, () =>
      analytics.captureError(
        "purchase_attach_expired",
        new Error("purchase_attach_expired"),
      ),
    );
    if (claimed) notePurchaseLanding();
    let attach: ReturnType<typeof startRevenueCatIdentitySync> | null = null;
    const attachPurchase = () => {
      attach?.dispose();
      attach = startRevenueCatIdentitySync({
        sync: () =>
          attachPurchaseToAccount(sub, () => syncPurchaseRef.current({})),
        onReady: clearPurchaseBeforeSignIn,
        onError: (error) =>
          analytics.captureError("purchase_sync_failed", error),
      });
    };
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
      onReady: () => {
        markRcUserSynced(sub);
        if (cancelled || !claimed) return;
        attachPurchase();
      },
      onError: reportRevenueCatIdentityError,
    });
    const stopLanding = subscribePurchaseLanding(() => {
      if (readPurchaseLanding() > 0) attachPurchase();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      observer.retry();
      attach?.retry();
    });

    return () => {
      cancelled = true;
      observer.dispose();
      attach?.dispose();
      stopLanding();
      subscription.remove();
      if (_rcTargetUserId === sub) setRcTargetUserId(null);
    };
  }, [sub, signedOut]);

  useEntitlementActivation(activeStatus);
}

// logIn merges an anonymous purchase only into an account with no anonymous history, so sync the receipt either way.
async function attachPurchaseToAccount(
  sub: string,
  syncPurchase: () => Promise<boolean>,
): Promise<void> {
  const receipt = _rcIdentitySync.then(async () => {
    if (_rcSyncedUserId !== sub) throw new Error("purchase_attach_superseded");
    try {
      await getPurchases()?.syncPurchasesForResult();
    } catch (error) {
      analytics.captureError("revenuecat_purchase_attach_failed", error);
    }
  });
  _rcIdentitySync = receipt.catch(() => {});
  await receipt;
  if (!(await syncPurchase())) throw new Error("purchase_not_attached");
}

// Not on every signed-out screen: an anonymous customer posting a renewal would take the subscription off its account.
function prepareAnonymousRevenueCat(): void {
  if (_rcAnonymousReady) return;
  const attempt = _rcIdentitySync.then(async () => {
    if (!_rcSignedOut || _rcTargetUserId !== null) return;
    await configureRevenueCat(undefined);
    const rc = getPurchases();
    if (!rc) throw new Error("revenuecat_module_unavailable");
    if (!(await rc.isAnonymous())) await rc.logOut();
    if (_rcSignedOut && _rcTargetUserId === null) _rcAnonymousReady = true;
  });
  _rcIdentitySync = attempt.catch((error: unknown) =>
    analytics.captureError("revenuecat_anonymous_sync_failed", error),
  );
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

/** Advisory view: expiry uses the client clock since Convex queries do not rerun as time passes; gated mutations re-check it. */
export function useEntitlement(): Entitlement {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data } = useQuery(
    convexQuery(
      api.subscriptions.getEntitlement,
      isAuthenticated ? {} : "skip",
    ),
  );
  // The useState initializer keeps Date.now out of render, which the React compiler flags.
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
  const anonymous =
    placement === ANONYMOUS_PLACEMENT &&
    _rcTargetUserId === null &&
    _rcSignedOut;
  if (anonymous && !REVENUECAT_DISABLED_BY_BUILD) prepareAnonymousRevenueCat();
  if (!(await awaitRcSyncReady(anonymous))) {
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
    const [{ offering, trial, eligibility }, customerRead] = await Promise.all([
      readPaywallOffering(),
      refreshCustomerInfo(),
    ]);
    if (!customerRead) {
      failed("customer_info_unavailable");
      return "unavailable";
    }
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
      getOnboardingProgress(),
    );
    // A sign-out during those reads must not open a paywall that cannot close.
    if (!rcReadyFor(anonymous)) {
      failed("identity_not_ready");
      return "unavailable";
    }
    // Keep IfNeeded so a restore that finds Pro dismisses the paywall too.
    const present = () =>
      rcui.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: REVENUECAT_PRO_ENTITLEMENT,
        offering,
        customVariables,
      });
    const result = await observePaywallPresentation(
      enriched,
      () => nativePresentation(owner, present).then(confirmRestore),
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

/** Called by the app root on every touch; one after the native paywall should cover the app shows UIKit refused it. */
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

/** Resolves once no RevenueCat sheet is up and the last has slid away, so a React Native modal can present. */
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

/** True while a native RevenueCat sheet (paywall or Customer Center) is up. */
export function isPaywallPending(): boolean {
  return liveSheet() !== null;
}

type Presentation = { outcome: PaywallOutcome; owned: boolean };

async function presentPaywall(placement = "pro_gate"): Promise<Presentation> {
  // iOS presents one sheet at a time; a concurrent second presentation leaves both RevenueCat promises unsettled.
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

/** Resolves true only on purchase/restore; routes to the paywall screen when unavailable, never on cancel. */
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

/** `openPaywall` returning the outcome; the onboarding placement never gets the fallback screen. */
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

/** True if the Customer Center (set up in the RevenueCat dashboard) was presented; false if the SDK lacks it or sync timed out. */
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

/** True only when RevenueCat says "eligible"; a pending sync, failed read or unknown answer reads as false. */
export async function readTrialEligible(): Promise<boolean> {
  if (!(await awaitRcSyncReady())) return false;
  try {
    return (await readPaywallContext()).trial_eligible === "eligible";
  } catch {
    return false;
  }
}

/** Runs `action` only when entitled, else opens the paywall; resolves false whenever the action did not run. */
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

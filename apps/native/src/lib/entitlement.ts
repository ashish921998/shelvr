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
  readPaywallContext,
  readPaywallOffering,
  recordAccess,
  recordBlockedAction,
  resumeBlockedAction,
  useEntitlementActivation,
} from "@/lib/paywall-funnel";
import { getRCUI, getPurchases } from "@/lib/revenuecat-module";
import { observePaywallPresentation } from "@/lib/paywall-telemetry";
import {
  EXIT_OFFER_WINDOW_MS,
  exitOfferDue,
  exitOfferEndsAt,
  exitOfferShownKey,
  findExitOffering,
  parseShownAt,
  timeLeft,
} from "@/lib/exit-offer";
import { t } from "@/lib/i18n";
import { trialTimelineVariables } from "@/lib/date";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import {
  mapPaywallResult,
  restoreFoundAccess,
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
import { presentExitSheet } from "./exit-offer-sheet";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

/**
 * Shelvr Pro entitlement.
 *
 * The source of truth for "is this user entitled" is the Convex
 * `subscriptions` row, written by the RevenueCat webhook. The RevenueCat SDK is
 * used only to present offerings and drive purchases — never to gate features
 * directly — so a spoofed client can't unlock Pro without a real subscription.
 *
 * Model: the yearly plan carries a 7-day free trial (payment method upfront,
 * auto-charges at day 7 unless cancelled); the monthly plan has no trial and
 * charges immediately. No free tier. A lapsed user
 * (trial or subscription ended) is read-only: they can view and search existing
 * saves and spaces, but every save and Pro feature routes to the paywall.
 *
 * The paywall UI itself is rendered natively by RevenueCat's SDK (designed in
 * the RevenueCat dashboard Paywall Editor). We call `presentPaywall()` which
 * presents a native sheet — no custom paywall view code needed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RevenueCat identity sync readiness
// ---------------------------------------------------------------------------

/**
 * Tracks which Convex user RevenueCat is targeting and which user has actually
 * been synced. The paywall is ready only when both ids match — otherwise a
 * purchase could be attributed to an anonymous RevenueCat user instead of the
 * Convex user id the webhook keys on. This is a module-level state so any caller
 * of `presentPaywall` can observe it without a direct hook dependency.
 */
let _rcTargetUserId: string | null = null;
let _rcSyncedUserId: string | null = null;
let _rcIdentitySync = Promise.resolve();

// Maximum time presentPaywall waits for RC identity sync before giving up and
// letting the caller fall back to the paywall route. Long enough to cover a
// normal logIn round-trip, short enough that a missing/unconfigured RC SDK
// (Expo Go, unset key, outage) doesn't freeze the UI.
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

/**
 * Block until RevenueCat identity sync completes, or give up after
 * `SYNC_READY_TIMEOUT_MS`. A purchase/management action before login would be
 * attributed to an anonymous RC user, breaking the webhook's userId mapping.
 * The timeout caps the wait so a missing/unconfigured RC SDK (Expo Go, unset
 * key, logIn failure, RC outage) cannot wedge the UI forever — callers fall
 * back to a safe route. Shared by `presentPaywall` and `presentCustomerCenter`.
 */
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

// ---------------------------------------------------------------------------
// RevenueCat configuration
// ---------------------------------------------------------------------------

let configured = false;

/**
 * Configure the RevenueCat SDK with the platform-specific public key. Safe to
 * call repeatedly; only configures once. Missing configuration is reported
 * by the identity sync observer and never marks the paywall ready.
 */
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

/**
 * Keep RevenueCat's app user id in sync with the Convex Auth user id.
 * RevenueCat's `original_app_user_id` becomes the `userId` the webhook writes,
 * so it must match the `users` document id every other table keys on. Call once
 * after sign-in.
 *
 * Identity changes are serialized, and readiness is recorded for the current
 * user id only after `rc.logIn` succeeds. Sign-out or a user change clears it
 * immediately so `presentPaywall` cannot use a previous account's session.
 */
export function useEntitlementSync(): void {
  const { isAuthenticated } = useConvexAuth();
  const { data: user } = useCurrentUser();
  const sub = isAuthenticated ? (user?._id ?? null) : null;
  const entitlement = useEntitlement();
  // The status an `entitlement_activated` event may report: narrowed from
  // `useEntitlement`'s wider union to the entitled statuses.
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
      // The funnel memory belongs to the account that earned it, so a
      // sign-out or account change drops it (see `forgetPaywallFunnel`).
      forgetPaywallFunnel();
      return;
    }
    // A build that deliberately has no key would only burn the retry budget
    // and report the absence as a sync failure on every foreground. Readiness
    // stays false, so purchase entry points still degrade to unavailable.
    if (REVENUECAT_DISABLED_BY_BUILD) return;

    let cancelled = false;
    const observer = startRevenueCatIdentitySync({
      sync: () => {
        // Keep retries and account changes on the same serial queue.
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

  // Purchase/restore -> backend entitlement available: the RevenueCat webhook
  // has written the row and the client's query now shows it.
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
  // The bounded reason travels as a property, not an error message:
  // `captureError` redacts any message outside its fixed allowlist (free-form
  // text can carry user content), so a reason wrapped in an Error never
  // reaches PostHog. The original error keeps its class and stack, which name
  // the real failure site better than a synthetic error would.
  analytics.captureError("purchase_identity_sync_failed", error, { reason });
}

// ---------------------------------------------------------------------------
// Entitlement query
// ---------------------------------------------------------------------------

/**
 * The current user's entitlement, derived from the Convex `subscriptions` row.
 * `entitled` is computed against the client's own clock so the query never
 * reads the wall clock (queries aren't rerun as time advances); the server
 * re-checks expiry inside gated mutations, so a stale client view can never
 * grant access the server denies.
 */
export function useEntitlement(): Entitlement {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data } = useQuery(
    convexQuery(
      api.subscriptions.getEntitlement,
      isAuthenticated ? {} : "skip",
    ),
  );
  // The clock is seeded once and refreshed on an interval so a trial expiring
  // between Convex updates flips `entitled` without a server push. Seeding via
  // a useState initializer (and updating inside the effect) keeps Date.now
  // out of the render body — the React compiler flags impure calls there.
  // The interval only runs while there's an expiry to count down — a user with
  // no subscription never ticks, avoiding a per-screen 60s rerender.
  const [now, setNow] = useState(() => Date.now());
  const hasExpiry = data?.expiresAt !== undefined;
  useEffect(() => {
    if (!hasExpiry) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [hasExpiry]);

  // Onboarding is intentionally visible before sign-in. Do not invoke the
  // authenticated Convex query in that state, and never render persisted data
  // from a previous account as this user's entitlement.
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
  // The shared gate — same logic the server uses in requireProEntitlement, so
  // the client's advisory view can never grant access the server denies.
  const active = isEntitled(data.status, expiresAt, now);
  return {
    status: active ? data.status : "lapsed",
    entitled: active,
    loading: false,
    now,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Paywall presentation
// ---------------------------------------------------------------------------

/**
 * Present the RevenueCat paywall natively (sheet on iOS). Returns a three-way
 * outcome so callers can distinguish purchase/restore, user cancellation, and
 * real unavailability (SDK missing, identity sync timeout, ERROR).
 *
 * The paywall is NOT presented until RevenueCat identity sync is ready (the
 * Convex user id has been logged in to RC), so a purchase is always attributed
 * to the correct user.
 */
async function presentPaywallImpl(
  placement = "pro_gate",
): Promise<PaywallOutcome> {
  const properties = { placement, paywall_attempt_id: randomUUID() };
  const requestedAt = Date.now();
  analytics.capture("paywall_requested", properties);
  // Started before the identity gate and awaited after it, so the cached
  // RevenueCat reads never add their own wait in front of the sheet.
  const context = readPaywallContext();
  const failed = (reason: string) =>
    analytics.capture("paywall_failed", {
      ...properties,
      reason,
      duration_ms: Math.max(0, Date.now() - requestedAt),
    });
  // A purchase before RC identity sync would be attributed to an anonymous RC
  // user, breaking the webhook's userId mapping, so block until it completes.
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
    const enriched = { ...properties, ...(await context) };
    // Read after identity sync, so the dates come from this account's
    // offering, and presented from the same snapshot. An unknown trial length
    // dates nothing: the paywall falls back to its undated labels instead of
    // claiming a length the offer may not have.
    const { offering, trial } = await readPaywallOffering();
    const customVariables = trial && trialTimelineVariables(Date.now(), trial);
    const result = await observePaywallPresentation(
      enriched,
      () =>
        rcui.presentPaywall({ offering, customVariables }).then(confirmRestore),
      activeProductId,
    );
    if (result === "PURCHASED" || result === "RESTORED") {
      recordAccess(result === "RESTORED" ? "restore" : "purchase");
    }
    // PAYWALL_RESULT values: NOT_PRESENTED, ERROR, CANCELLED, PURCHASED, RESTORED
    const outcome = mapPaywallResult(result);
    if (outcome !== "cancelled") return outcome;
    return (await presentExitOffer(rcui, placement)) ?? outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * RevenueCat's sheet resolves RESTORED once Restore was tapped, even when
 * nothing was found. An empty restore is a close, so the caller is not told
 * the user subscribed and the exit offer still follows.
 */
async function confirmRestore(result: string): Promise<string> {
  if (result !== "RESTORED") return result;
  const info = await getPurchases()
    ?.getCustomerInfo()
    .catch(() => null);
  return restoreFoundAccess(info) ? result : "CANCELLED";
}

// Home re-reads the open offer whenever it is claimed or released.
const exitOfferListeners = new Set<() => void>();
const notifyExitOffer = () => exitOfferListeners.forEach((read) => read());

function readShownAt(userId: string): number | null {
  try {
    return parseShownAt(SecureStore.getItem(exitOfferShownKey(userId)));
  } catch {
    return null;
  }
}

function exitOfferDeps(rc: NonNullable<ReturnType<typeof getPurchases>>) {
  return {
    getOfferings: () => rc.getOfferings(),
    checkEligibility: (ids: string[]) =>
      rc.checkTrialOrIntroductoryPriceEligibility(ids),
  };
}

/**
 * After a paywall close, present the discounted exit offering once (see
 * `exit-offer.ts`). Showing it opens the offer's 24-hour window. Runs inside
 * the same sheet latch as the paywall it follows. Returns null when nothing
 * was shown; a failure after the user already closed the paywall stays a
 * cancel, never the fallback screen.
 */
async function presentExitOffer(
  rcui: NonNullable<ReturnType<typeof getRCUI>>,
  sourcePlacement: string,
): Promise<PaywallOutcome | null> {
  const userId = _rcSyncedUserId;
  const rc = getPurchases();
  if (!userId || !rc) return null;
  const key = exitOfferShownKey(userId);
  const now = Date.now();
  let lastShownAt: number | null;
  try {
    lastShownAt = parseShownAt(SecureStore.getItem(key));
  } catch {
    return null;
  }
  if (!exitOfferDue(sourcePlacement, lastShownAt, now)) return null;
  const offering = await findExitOffering(exitOfferDeps(rc));
  if (!offering) return null;
  try {
    // Claim before presenting, so a crash mid-sheet can't repeat it.
    SecureStore.setItem(key, String(now));
  } catch {
    return null;
  }
  notifyExitOffer();
  // UIKit refuses to present while the first paywall is still dismissing.
  await waitForSheetTransition();
  // A sheet that never appeared must not open the window.
  // Awaited before the sheet latch clears, so a later claim can't race it.
  const release = async () => {
    try {
      if (lastShownAt === null) await SecureStore.deleteItemAsync(key);
      else SecureStore.setItem(key, String(lastShownAt));
    } catch {
      // Best-effort; the worst case is one skipped offer.
    }
    notifyExitOffer();
  };
  const outcome = await showExitOffering(
    rcui,
    offering,
    sourcePlacement,
    now + EXIT_OFFER_WINDOW_MS,
    release,
  );
  // The user already closed the paywall, so a failed offer stays a cancel.
  return outcome === "success" ? outcome : "cancelled";
}

async function showExitOffering(
  rcui: NonNullable<ReturnType<typeof getRCUI>>,
  offering: import("react-native-purchases").PurchasesOffering,
  sourcePlacement: string,
  endsAt: number,
  onNotPresented: () => void | Promise<void> = () => {},
): Promise<PaywallOutcome> {
  const properties = {
    placement: "exit_offer",
    source_placement: sourcePlacement,
    paywall_attempt_id: randomUUID(),
    // The exit sheet renders a known offering, so its id needs no SDK read.
    offering_id: offering.identifier,
  };
  analytics.capture("paywall_requested", properties);
  try {
    const result = await observePaywallPresentation(
      properties,
      () =>
        // Our own sheet, so the offer can close at its deadline.
        presentExitSheet({
          Paywall: rcui.Paywall,
          offering,
          customVariables: exitOfferVariables(endsAt),
          endsAt,
          // The one paywall mounted as a component, so the one place the
          // purchase tap itself is observable.
          onPurchaseStarted: (packageId) =>
            analytics.capture("paywall_purchase_started", {
              placement: "exit_offer",
              paywall_attempt_id: properties.paywall_attempt_id,
              package_id: packageId,
            }),
        }),
      activeProductId,
    );
    if (result === "PURCHASED" || result === "RESTORED") {
      recordAccess(result === "RESTORED" ? "restore" : "purchase");
    }
    if (result === "NOT_PRESENTED" || result === "ERROR")
      await onNotPresented();
    return mapPaywallResult(result);
  } catch {
    await onNotPresented();
    return "unavailable";
  }
}

/**
 * The time left, filled into the paywall's `{{ custom.offer_ends }}` line when
 * the sheet opens. The dashboard default ("Available for a limited time.")
 * covers older builds that pass nothing.
 */
function exitOfferVariables(endsAt: number) {
  const { hours, minutes } = timeLeft(endsAt - Date.now());
  const value = t("exitOffer.sheetEndsIn", {
    hours: String(hours),
    minutes: String(minutes),
  });
  return { offer_ends: { type: "string", value } as const };
}

/**
 * Reopen the exit offer from its Home countdown while the window is open.
 * If the window closed or the offering vanished since Home rendered, the
 * regular paywall opens instead, so the tap never dead-ends.
 */
async function presentOpenExitOfferImpl(): Promise<PaywallOutcome> {
  if (!(await awaitRcSyncReady())) return presentPaywallImpl("home_card");
  const userId = _rcSyncedUserId;
  const rc = getPurchases();
  const rcui = getRCUI();
  const endsAt = userId
    ? exitOfferEndsAt(readShownAt(userId), Date.now())
    : null;
  if (!rc || !rcui || endsAt === null) return presentPaywallImpl("home_card");
  if (!(await syncRevenueCatUILocale(rc))) return "unavailable";
  const offering = await findExitOffering(exitOfferDeps(rc));
  // The lookup can outlast the window; never sell the offer after it closes.
  if (!offering || exitOfferEndsAt(readShownAt(userId!), Date.now()) === null)
    return presentPaywallImpl("home_card");
  return showExitOffering(rcui, offering, "home_countdown", endsAt);
}

function subscribeExitOffer(onChange: () => void): () => void {
  exitOfferListeners.add(onChange);
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") onChange();
  });
  return () => {
    exitOfferListeners.delete(onChange);
    sub.remove();
  };
}

/**
 * The open exit offer's closing time for this account, or null. Updates when
 * the offer is claimed, released, or expires, and on return to the app.
 */
export function useExitOfferEndsAt(userId: string | undefined): number | null {
  const shownAt = useSyncExternalStore(subscribeExitOffer, () =>
    userId ? readShownAt(userId) : null,
  );
  // Re-render at the deadline so the card disappears on time.
  const [now, setNow] = useState(Date.now);
  const endsAt = exitOfferEndsAt(shownAt, now);
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, endsAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [endsAt]);
  return endsAt;
}

// A RevenueCat promise that never settles must not hold the latch for the
// life of the process; past this age the sheet is presumed gone.
const SHEET_STALE_MS = 5 * 60_000;

type OpenSheet = {
  startedAt: number;
  // null while the Customer Center holds the latch.
  paywall: Promise<PaywallOutcome> | null;
};
let openSheet: OpenSheet | null = null;

function liveSheet(): OpenSheet | null {
  if (openSheet && Date.now() - openSheet.startedAt < SHEET_STALE_MS) {
    return openSheet;
  }
  openSheet = null;
  return null;
}

// Callers waiting for the live sheet to close (see `whenSheetSettled`).
const sheetWaiters = new Set<() => void>();

function releaseSheet(sheet: OpenSheet): void {
  if (openSheet !== sheet) return;
  openSheet = null;
  const waiters = [...sheetWaiters];
  sheetWaiters.clear();
  for (const waiter of waiters) waiter();
}

/**
 * Resolves once no RevenueCat sheet is up and the last one has finished
 * sliding away, so a React Native modal can present. A sheet whose promise
 * never settles is presumed gone at the same age `liveSheet` drops it.
 */
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

/** `owned` is false when this call joined a presentation someone else opened. */
type Presentation = { outcome: PaywallOutcome; owned: boolean };

async function presentPaywall(
  placement = "pro_gate",
  present: () => Promise<PaywallOutcome> = () => presentPaywallImpl(placement),
): Promise<Presentation> {
  // iOS presents one sheet at a time. A second presentation raced against a
  // live one leaves both RevenueCat promises unsettled, so neither reports an
  // outcome and the user sees at most one paywall. The `share` placement
  // shipped 6 presentations and 2 outcomes this way. A duplicate caller joins
  // the live presentation and receives its real outcome. Behind a Customer
  // Center sheet it reports `cancelled` rather than `unavailable`, because
  // the fallback route would stack a second screen behind the sheet.
  const live = liveSheet();
  if (live) {
    const outcome = live.paywall ? await live.paywall : "cancelled";
    return { outcome, owned: false };
  }
  const sheet: OpenSheet = { startedAt: Date.now(), paywall: null };
  sheet.paywall = present().finally(() => {
    // A stale sheet may already have been replaced; only release our own.
    releaseSheet(sheet);
  });
  openSheet = sheet;
  return { outcome: await sheet.paywall, owned: true };
}

/**
 * Present the RevenueCat paywall. On real unavailability (SDK not linked, sync
 * timed out, ERROR), fall back to the paywall route. On cancellation, return
 * to the caller without routing — cancel must not look like an outage. Returns
 * `true` only on purchase/restore. Shared by every Pro-gated affordance.
 */
export async function openPaywall(
  router: ReturnType<typeof useRouter>,
  placement = "pro_gate",
): Promise<boolean> {
  const { outcome, owned } = await presentPaywall(placement);
  // Only the caller that opened the sheet may route. Joined callers share the
  // same `unavailable`, and a second push stacks a second paywall screen.
  if (owned && shouldOpenPaywallFallback(outcome)) {
    router.push("/(app)/paywall");
  }
  // The gated action did not run — whatever the sheet resolved to, the caller
  // re-taps. Remember the block so the guard that later lets the action
  // through can report the resume, and whether a purchase sits between.
  recordBlockedAction(placement, outcome === "success");
  return outcome === "success";
}

/** `openPaywall` for the Home countdown: reopens the open exit offer. */
export async function openExitOffer(
  router: ReturnType<typeof useRouter>,
): Promise<boolean> {
  const { outcome, owned } = await presentPaywall(
    "home_countdown",
    presentOpenExitOfferImpl,
  );
  if (owned && shouldOpenPaywallFallback(outcome)) {
    router.push("/(app)/paywall");
  }
  return outcome === "success";
}

// ---------------------------------------------------------------------------
// Customer Center
// ---------------------------------------------------------------------------

/**
 * Present the RevenueCat Customer Center natively (sheet on iOS), where the
 * user can manage their subscription: change plan, request a refund (iOS),
 * restore purchases, cancel, or open a configured deeplink/URL. Like the
 * paywall, this is NOT presented until RC identity sync is ready — management
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
    // Same identity-sync gate as presentPaywall: a restore or refund before
    // login would be attributed to an anonymous RC user and not reflected in
    // the subscriptions row keyed on the Convex user id.
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

/**
 * Restore App Store purchases for the signed-in RevenueCat identity. This is a
 * first-class Profile action so a returning subscriber does not have to infer
 * that Restore is hidden inside the paywall or Customer Center.
 */
export async function restorePurchases(): Promise<RestorePurchasesOutcome> {
  if (!(await awaitRcSyncReady())) return "unavailable";

  const rc = getPurchases();
  if (!rc) return "unavailable";
  try {
    const customerInfo = await rc.restorePurchases();
    if (Object.keys(customerInfo.entitlements.active).length === 0)
      return "none";
    // A Profile restore arms the same activation measurement a sheet restore
    // does — but only while nothing is entitled: restoring an already-visible
    // entitlement made nothing new visible, so it reports nothing.
    if (!hasActiveEntitlement()) recordAccess("restore");
    return "restored";
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------------------
// Trial cancellation detection (next-visit cancel survey)
// ---------------------------------------------------------------------------

/**
 * Read the signed-in user's trial-cancellation state from RevenueCat. Same
 * identity-sync gate as the other RC reads, so the answer is always for the
 * logged-in Convex user (a stale anonymous CustomerInfo can never trigger
 * the survey). Classification lives in `trial-cancellation.ts`.
 */
export async function readRcTrialCancellation(): Promise<TrialCancellationState> {
  if (!(await awaitRcSyncReady())) return "unknown";
  const rc = getPurchases();
  if (!rc) return "unknown";
  return await readFreshTrialCancellation(rc);
}

// ---------------------------------------------------------------------------
// Paywall guard
// ---------------------------------------------------------------------------

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
 * While entitlement is loading, the guard returns `false` without acting —
 * callers should disable the affordance or show a loading state. The hook also
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
        // A pass at the same placement that a paywall recently blocked reports
        // the resume — the funnel's last leg after purchase/restore.
        resumeBlockedAction(placement);
        action?.();
        return true;
      }
      // Fallback to the paywall screen is handled by openPaywall (reached when
      // the native SDK isn't linked, identity sync times out, or RC returns an error).
      await openPaywall(router, placement);
      return false;
    },
    [entitled, loading, placement, router],
  );
  return { guard, loading };
}

import { api } from '@convex/_generated/api';
import { isEntitled } from '@convex/model/entitlement';
import { convexQuery } from '@convex-dev/react-query';
import { useConvexAuth } from 'convex/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

/**
 * Shelvr Pro entitlement.
 *
 * The source of truth for "is this user entitled" is the Convex
 * `subscriptions` row, written by the RevenueCat webhook. The RevenueCat SDK is
 * used only to present offerings and drive purchases — never to gate features
 * directly — so a spoofed client can't unlock Pro without a real subscription.
 *
 * Model: the yearly plan carries a 3-day free trial (payment method upfront,
 * auto-charges at day 3 unless cancelled); the monthly plan has no trial and
 * charges immediately. Then $4.99/mo or $39.99/yr. No free tier. A lapsed user
 * (trial or subscription ended) is read-only: they can view and search existing
 * saves and spaces, but every save and Pro feature routes to the paywall.
 *
 * The paywall UI itself is rendered natively by RevenueCat's SDK (designed in
 * the RevenueCat dashboard Paywall Editor). We call `presentPaywall()` which
 * presents a native sheet — no custom paywall view code needed.
 */

// ---------------------------------------------------------------------------
// Lazy module loaders — the native modules may not be linked in Expo Go or a
// dev build without `expo prebuild`. We check NativeModules first so require()
// never runs (and the dev error overlay never fires) when the native side is
// missing.
// ---------------------------------------------------------------------------

/**
 * Builds a lazy accessor for a native module: returns the module's default
 * export once it's been confirmed linked (via one of `nativeNames` on
 * NativeModules), or `null` permanently if it isn't. The `require` lives in a
 * static thunk so Metro can statically discover and bundle it.
 */
function makeLazyModule<T>(
  nativeNames: string[],
  load: () => { default: T },
): () => T | null {
  let cached: T | null | undefined;
  return () => {
    if (cached !== undefined) return cached;
    const linked = nativeNames.some((n) => NativeModules[n as keyof typeof NativeModules]);
    if (!linked) {
      cached = null;
      return cached;
    }
    try {
      cached = load().default;
    } catch {
      cached = null;
    }
    return cached;
  };
}

const getPurchases = makeLazyModule<typeof import('react-native-purchases').default>(
  ['RNPurchases', 'RNPurchasesModule'],
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('react-native-purchases'),
);

const getRCUI = makeLazyModule<typeof import('react-native-purchases-ui').default>(
  // react-native-purchases-ui registers its native module as `RNPaywalls`
  // (plural). The older `RNPaywall` (singular) name is retained as a fallback
  // for any older linking variant.
  ['RNPaywalls', 'RNPaywall', 'RNRevenueCatUI', 'RCPurchasesUiModule'],
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('react-native-purchases-ui'),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntitlementStatus = 'trialing' | 'pro' | 'lapsed' | 'lifetime' | 'none';

export type Entitlement = {
  status: EntitlementStatus;
  entitled: boolean;
  loading: boolean;
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
    new Promise<boolean>((r) => setTimeout(() => r(false), SYNC_READY_TIMEOUT_MS)),
  ]);
}

/**
 * Delay before presenting RevenueCat UI after a sheet/stack transition. UIKit
 * refuses to present while a dismiss is mid-flight ("already presenting
 * RNSScreen"), so callers `router.back()` / complete a transition first, then
 * await this. One home for the magic number so it can't drift between screens.
 */
export const SHEET_SETTLE_MS = 600;

export function waitForSheetTransition(): Promise<void> {
  return new Promise((r) => setTimeout(r, SHEET_SETTLE_MS));
}

// ---------------------------------------------------------------------------
// RevenueCat configuration
// ---------------------------------------------------------------------------

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/**
 * Configure the RevenueCat SDK with the platform-specific public key. Safe to
 * call repeatedly; only configures once. No-op if the key for this platform
 * isn't set (e.g. dev without RC configured) — entitlement then stays `none`
 * until a subscription row is written by the webhook.
 */
export async function configureRevenueCat(): Promise<void> {
  if (configured) return;
  const rc = getPurchases();
  if (!rc) return;
  const apiKey = process.env.EXPO_OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;
  await rc.configure({ apiKey });
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
  const { data: user } = useQuery(convexQuery(api.users.getCurrentUser, {}));
  const sub = isAuthenticated ? (user?._id ?? null) : null;

  useEffect(() => {
    setRcTargetUserId(sub);
    if (sub === null) return;

    let cancelled = false;
    // Serialize identity changes so an older in-flight logIn cannot finish
    // after a newer one and leave the native SDK on the wrong account.
    _rcIdentitySync = _rcIdentitySync
      .catch(() => {})
      .then(async () => {
        if (cancelled || _rcTargetUserId !== sub) return;
        await configureRevenueCat();
        if (cancelled || _rcTargetUserId !== sub) return;
        const rc = getPurchases();
        if (!rc) return;
        await rc.logIn(sub);
        if (!cancelled) markRcUserSynced(sub);
      })
      .catch(() => {
        // Missing configuration or a failed login leaves this user unready;
        // presentPaywall will time out and use the safe fallback route.
      });

    return () => {
      cancelled = true;
      if (_rcTargetUserId === sub) setRcTargetUserId(null);
    };
  }, [sub]);
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
  const { data } = useQuery({
    ...convexQuery(api.subscriptions.getEntitlement, {}),
    enabled: isAuthenticated,
  });
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
    return { status: 'none', entitled: false, loading: authLoading };
  }
  if (!data || data.status === 'none') {
    return { status: 'none', entitled: false, loading: data === undefined };
  }
  const expiresAt = data.expiresAt;
  // The shared gate — same logic the server uses in requireProEntitlement, so
  // the client's advisory view can never grant access the server denies.
  const active = isEntitled(data.status, expiresAt, now);
  return {
    status: active ? data.status : 'lapsed',
    entitled: active,
    loading: false,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Paywall presentation
// ---------------------------------------------------------------------------

/**
 * Present the RevenueCat paywall natively (sheet on iOS). Returns `true` only
 * when the paywall was presented AND the user completed a purchase or restore.
 * Returns `false` if the RC UI SDK isn't linked, the paywall wasn't presented,
 * the user cancelled, or an error occurred. Callers should fall back to
 * routing to the paywall route when this returns `false`.
 *
 * The paywall is NOT presented until RevenueCat identity sync is ready (the
 * Convex user id has been logged in to RC), so a purchase is always attributed
 * to the correct user.
 */
export async function presentPaywall(): Promise<boolean> {
  // Block until RC identity sync completes — a purchase before login would be
  // attributed to an anonymous RC user, breaking the webhook's userId mapping.
  // The awaitRcSyncReady timeout returns false so the caller routes to the
  // paywall screen without ever opening a purchase flow under an unsafe identity.
  if (!(await awaitRcSyncReady())) return false;

  const rcui = getRCUI();
  if (!rcui) return false;
  try {
    const result = await rcui.presentPaywall();
    // PAYWALL_RESULT values: NOT_PRESENTED, ERROR, CANCELLED, PURCHASED, RESTORED
    return result === 'PURCHASED' || result === 'RESTORED';
  } catch {
    return false;
  }
}

/**
 * Present the RevenueCat paywall, and if it can't be presented (SDK not linked,
 * user dismissed without purchase, or sync timed out), fall back to routing to
 * the paywall screen. Returns `true` only when the paywall was presented and
 * resulted in a purchase/restore. The one call every Pro-gated affordance and
 * the profile row shares — keeps the `'/(app)/paywall'` route string in one
 * place.
 */
export async function openPaywall(router: ReturnType<typeof useRouter>): Promise<boolean> {
  const ok = await presentPaywall();
  if (!ok) router.push('/(app)/paywall');
  return ok;
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
  // Same identity-sync gate as presentPaywall: a restore or refund before login
  // would be attributed to an anonymous RC user and not reflected in the
  // subscriptions row keyed on the Convex user id.
  if (!(await awaitRcSyncReady())) return false;

  const rcui = getRCUI();
  if (!rcui || typeof rcui.presentCustomerCenter !== 'function') return false;
  try {
    await rcui.presentCustomerCenter();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Paywall guard
// ---------------------------------------------------------------------------

/**
 * Returns a guard that runs `action` only when the user is entitled, otherwise
 * presents the RevenueCat paywall (native sheet). If the RC UI SDK isn't linked
 * or the paywall is dismissed without purchase, falls back to routing to the
 * paywall route. Use this at every Pro-gated affordance (Save, dynamic spaces,
 * Find links, Tidy, Map) so the paywall appears at a moment of felt need rather
 * than blocking the whole app. The server re-checks entitlement on every gated
 * mutation, so this client guard is advisory only.
 *
 * While entitlement is loading, the guard returns `false` without acting —
 * callers should disable the affordance or show a loading state. The hook also
 * returns `loading` so callers can read it without a second `useEntitlement`.
 */
export function usePaywallGuard(): {
  guard: (action?: () => void) => Promise<boolean>;
  loading: boolean;
} {
  const { entitled, loading } = useEntitlement();
  const router = useRouter();
  const guard = useCallback(
    async (action?: () => void) => {
      if (loading) return false;
      if (entitled) {
        action?.();
        return true;
      }
      // Fallback to the paywall screen is handled by openPaywall (reached when
      // the native SDK isn't linked, or the user dismissed without purchasing).
      await openPaywall(router);
      return false;
    },
    [entitled, loading, router],
  );
  return { guard, loading };
}

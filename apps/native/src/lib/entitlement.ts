import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useUser } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules } from 'react-native';

/**
 * Shelvr Pro entitlement.
 *
 * The source of truth for "is this user entitled" is the Convex
 * `subscriptions` row, written by the RevenueCat webhook. The RevenueCat SDK is
 * used only to present offerings and drive purchases — never to gate features
 * directly — so a spoofed client can't unlock Pro without a real subscription.
 *
 * Model: 7-day free trial (payment method upfront, auto-charges at day 7 unless
 * cancelled), then $4.99/mo or $39.99/yr. No free tier. A lapsed user (trial or
 * subscription ended) is read-only: they can view and search existing saves and
 * spaces, but every save and Pro feature routes to the paywall.
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

let _purchases:
  | typeof import('react-native-purchases').default
  | null
  | undefined;
function getPurchases() {
  if (_purchases !== undefined) return _purchases;
  const linked = NativeModules.RNPurchases || NativeModules.RNPurchasesModule;
  if (!linked) {
    _purchases = null;
    return _purchases;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _purchases = require('react-native-purchases').default;
  } catch {
    _purchases = null;
  }
  return _purchases;
}

let _rcui:
  | typeof import('react-native-purchases-ui').default
  | null
  | undefined;
function getRCUI() {
  if (_rcui !== undefined) return _rcui;
  // react-native-purchases-ui registers its native module as `RNPaywalls`
  // (plural). The older `RNPaywall` (singular) name is retained as a fallback
  // for any older linking variant.
  const linked =
    NativeModules.RNPaywalls ||
    NativeModules.RNPaywall ||
    NativeModules.RNRevenueCatUI ||
    NativeModules.RCPurchasesUiModule;
  if (!linked) {
    _rcui = null;
    return _rcui;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _rcui = require('react-native-purchases-ui').default;
  } catch {
    _rcui = null;
  }
  return _rcui;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntitlementStatus = 'trialing' | 'pro' | 'lapsed' | 'none';

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
 * Tracks whether RevenueCat's app user id has been synced with the Clerk `sub`.
 * The paywall must not be presented until `rcSyncReady` is true — otherwise a
 * purchase could be attributed to an anonymous RevenueCat user instead of the
 * Clerk `sub` the webhook keys on. This is a module-level state so any caller
 * of `presentPaywall` can observe it without a direct hook dependency.
 */
let _rcSyncReady = false;
const _rcSyncListeners = new Set<(ready: boolean) => void>();

// Maximum time presentPaywall waits for RC identity sync before giving up and
// letting the caller fall back to the paywall route. Long enough to cover a
// normal logIn round-trip, short enough that a missing/unconfigured RC SDK
// (Expo Go, unset key, outage) doesn't freeze the UI.
const SYNC_READY_TIMEOUT_MS = 5000;

function setRcSyncReady(ready: boolean) {
  if (_rcSyncReady === ready) return;
  _rcSyncReady = ready;
  for (const fn of _rcSyncListeners) fn(ready);
}

/** Subscribe to RevenueCat sync-readiness changes. Returns an unsubscribe fn. */
function onRcSyncReady(fn: (ready: boolean) => void): () => void {
  _rcSyncListeners.add(fn);
  return () => {
    _rcSyncListeners.delete(fn);
  };
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
 * Keep RevenueCat's app user id in sync with the Clerk `sub`. RevenueCat's
 * `original_app_user_id` becomes the `userId` the webhook writes, so it must
 * match the Clerk `sub` every other table keys on. Call once after sign-in.
 *
 * `logged.current` is set only AFTER `rc.logIn` succeeds, so a failed login
 * can be retried on the next effect run. The sync-ready state is flipped to
 * true only after a successful login so `presentPaywall` can gate on it.
 */
export function useEntitlementSync(): void {
  const { user, isSignedIn } = useUser();
  const logged = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !user) return;
    const sub = user.id;
    // Configure first, then log in. logIn is idempotent for the same id.
    configureRevenueCat().then(() => {
      if (logged.current === sub) return;
      const rc = getPurchases();
      if (!rc) return;
      rc.logIn(sub)
        .then(() => {
          logged.current = sub;
          setRcSyncReady(true);
        })
        .catch(() => {
          // A failed logIn (e.g. RC not configured) is non-fatal — the webhook
          // simply won't fire until RC is wired; entitlement stays `none`.
          // `logged.current` is NOT set, so the next effect run retries.
        });
    });
  }, [isSignedIn, user]);
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
  const { data } = useQuery(convexQuery(api.subscriptions.getEntitlement, {}));
  // The clock is seeded once and refreshed on an interval so a trial expiring
  // between Convex updates flips `entitled` without a server push. Seeding via
  // a useState initializer (and updating inside the effect) keeps Date.now
  // out of the render body — the React compiler flags impure calls there.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data || data.status === 'none') {
    return { status: 'none', entitled: false, loading: data === undefined };
  }
  const expiresAt = data.expiresAt;
  const active = data.status !== 'lapsed' && (expiresAt ?? 0) > now;
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
 * Clerk `sub` has been logged in to RC), so a purchase is always attributed to
 * the correct user.
 */
export async function presentPaywall(): Promise<boolean> {
  // Block until RC identity sync completes — a purchase before login would be
  // attributed to an anonymous RC user, breaking the webhook's userId mapping.
  // Capped at SYNC_READY_TIMEOUT_MS so a missing/unconfigured RC SDK (Expo Go,
  // unset API key, logIn failure, RC outage) cannot wedge the UI forever: if
  // sync never completes we fall through, and the caller routes to the paywall
  // screen instead of hanging on a frozen gesture.
  if (!_rcSyncReady) {
    await new Promise<void>((resolve) => {
      if (_rcSyncReady) return resolve();
      let done = false;
      const unsub = onRcSyncReady(() => {
        if (done) return;
        done = true;
        unsub();
        resolve();
      });
      // Resolve on timeout so the caller's fallback route can still fire.
      setTimeout(() => {
        if (done) return;
        done = true;
        unsub();
        resolve();
      }, SYNC_READY_TIMEOUT_MS);
    });
  }

  const rcui = getRCUI();
  if (!rcui) return false;
  try {
    const result = await rcui.presentPaywall();
    // PAYWALL_RESULT values: NOT_PRESENTED, ERROR, CANCELLED, PURCHASED, RESTORED
    return (
      result === 'PURCHASED' ||
      result === 'RESTORED'
    );
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
 * callers should disable the affordance or show a loading state.
 */
export function usePaywallGuard(): (action?: () => void) => Promise<boolean> {
  const { entitled, loading } = useEntitlement();
  const router = useRouter();
  return useCallback(
    async (action?: () => void) => {
      if (loading) return false;
      if (entitled) {
        action?.();
        return true;
      }
      const presented = await presentPaywall();
      if (!presented) {
        // Fallback: route to the paywall screen (reached when native SDK
        // isn't linked, or the user dismissed without purchasing).
        router.push('/(app)/paywall');
      }
      return false;
    },
    [entitled, loading, router],
  );
}

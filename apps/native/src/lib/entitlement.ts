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
  const linked =
    NativeModules.RNRevenueCatUI ||
    NativeModules.RCPurchasesUiModule ||
    NativeModules.RNPaywall;
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
      logged.current = sub;
      rc.logIn(sub).catch(() => {
        // A failed logIn (e.g. RC not configured) is non-fatal — the webhook
        // simply won't fire until RC is wired; entitlement stays `none`.
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
 * Present the RevenueCat paywall natively (sheet on iOS). Falls back to
 * returning false if the RC UI SDK isn't linked; callers can then route to the
 * paywall route as a dev fallback.
 */
export function presentPaywall(): boolean {
  const rcui = getRCUI();
  if (rcui) {
    rcui.presentPaywall().catch(() => {});
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Paywall guard
// ---------------------------------------------------------------------------

/**
 * Returns a guard that runs `action` only when the user is entitled, otherwise
 * presents the RevenueCat paywall (native sheet). If the RC UI SDK isn't linked
 * yet, falls back to routing to the paywall route. Use this at every Pro-gated
 * affordance (Save, dynamic spaces, Find links, Tidy, Map) so the paywall
 * appears at a moment of felt need rather than blocking the whole app. The
 * server re-checks entitlement on every gated mutation, so this client guard is
 * advisory only.
 */
export function usePaywallGuard(): (action?: () => void) => boolean {
  const { entitled, loading } = useEntitlement();
  const router = useRouter();
  return useCallback(
    (action?: () => void) => {
      if (loading) return false;
      if (entitled) {
        action?.();
        return true;
      }
      if (!presentPaywall()) {
        // Fallback: route to the paywall screen (only reached in dev without
        // native build).
        router.push('/(app)/paywall');
      }
      return false;
    },
    [entitled, loading, router],
  );
}

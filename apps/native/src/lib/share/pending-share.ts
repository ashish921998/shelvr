/**
 * Records that an incoming Share Sheet payload was deferred because the user
 * still needs to finish onboarding and/or sign in. The native share payloads
 * themselves live in the expo-sharing app group; this flag only records that
 * Shelvr should resume the share flow instead of landing on Home.
 *
 * The adapter is injected so the rules stay pure and unit-testable without
 * SecureStore or React Native.
 */

export const PENDING_SHARE_KEY = 'shelvr.pending.share';

export interface PendingShareStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Marks that a share is waiting to be resumed after onboarding/auth. */
export function markPendingShare(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, '1');
}

/** True when a share was deferred and has not yet been consumed. */
export function hasPendingShare(store: PendingShareStore): boolean {
  const value = store.getItem(PENDING_SHARE_KEY);
  return value === '1';
}

/**
 * Consumes a pending share flag. Returns true exactly once per mark so the
 * resume navigation cannot loop if the share screen later redirects home.
 */
export function consumePendingShare(store: PendingShareStore): boolean {
  if (!hasPendingShare(store)) return false;
  store.setItem(PENDING_SHARE_KEY, '');
  return true;
}

/** Drops any pending share flag without resuming (e.g. user cancelled). */
export function clearPendingShare(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, '');
}

/**
 * Decides where an incoming share deep link should go given the current
 * onboarding and authentication state.
 *
 * - Fully ready → open the share receiver immediately
 * - Still onboarding → stay on the current path (onboarding owns the stack) but
 *   mark the share pending so finish() can resume it
 * - Onboarded but signed out → send the user to sign-in and mark pending
 */
export type ShareRouteDecision =
  | { action: 'open-share' }
  | { action: 'defer-onboarding'; markPending: true }
  | { action: 'defer-sign-in'; markPending: true; href: '/(auth)/sign-in' };

export function decideShareRoute(state: {
  onboarded: boolean;
  isAuthenticated: boolean;
}): ShareRouteDecision {
  if (state.onboarded && state.isAuthenticated) {
    return { action: 'open-share' };
  }
  if (!state.onboarded) {
    return { action: 'defer-onboarding', markPending: true };
  }
  return {
    action: 'defer-sign-in',
    markPending: true,
    href: '/(auth)/sign-in',
  };
}

/**
 * After onboarding completes and/or the user signs in, choose the next route.
 * A pending share wins over the default home landing so the Share Sheet is not
 * silently dropped.
 */
export function decidePostAuthRoute(state: {
  hasPendingShare: boolean;
}): '/' | '/share' {
  return state.hasPendingShare ? '/share' : '/';
}

/**
 * Records that an incoming Share Sheet payload was deferred because the user
 * still needs to finish onboarding and/or sign in. The native share payloads
 * themselves live in the expo-sharing app group; this flag only records that
 * Shelvr should resume the share flow instead of landing on Home.
 *
 * A second record guards the opposite extreme: a share the user explicitly
 * discarded whose native payload could not be cleared. The resume path treats
 * an unread payload batch as owed, so that leftover needs a marker saying
 * "this one was thrown away on purpose".
 *
 * The adapter is injected so the rules stay pure and unit-testable without
 * SecureStore or React Native.
 */

export const PENDING_SHARE_KEY = "shelvr.pending.share";

export interface PendingShareStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Marks that a share is waiting to be resumed after onboarding/auth. */
export function markPendingShareInStore(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, "1");
}

/** True when a share was deferred and has not yet been consumed. */
export function hasPendingShareInStore(store: PendingShareStore): boolean {
  const value = store.getItem(PENDING_SHARE_KEY);
  return value === "1";
}

/** Drops any pending share flag without resuming (e.g. user cancelled). */
export function clearPendingShareInStore(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, "");
}

export const DISCARDED_SHARE_KEY = "shelvr.discarded.share";

/**
 * Records the fingerprint of a share batch the user explicitly discarded
 * whose native clear threw, leaving the payload in the store. Without this
 * marker the resume path would route the leftover straight back to the share
 * screen, and with the session record already deleted it would re-save the
 * discarded batch under brand-new operation ids — duplicating entries that
 * the clearFailed window may already have saved.
 *
 * The record is fingerprint-scoped: a new, different batch never matches it
 * and resumes normally. The share screen drops the record on any successful
 * native clear, so once the leftover is finally gone a later deliberate
 * re-share of the same content is fresh again.
 */
export function markShareDiscardedInStore(
  store: PendingShareStore,
  fingerprint: string,
): void {
  store.setItem(DISCARDED_SHARE_KEY, fingerprint);
}

/**
 * True when `fingerprint` is exactly the batch the user explicitly discarded
 * and whose native payload is still pending. An empty record matches nothing.
 */
export function shareWasDiscardedInStore(
  store: PendingShareStore,
  fingerprint: string,
): boolean {
  return store.getItem(DISCARDED_SHARE_KEY) === fingerprint;
}

/**
 * Drops the discard record. Called once the native store is confirmed empty,
 * so the marker can never outlive the leftover it describes.
 */
export function clearShareDiscardedInStore(store: PendingShareStore): void {
  store.setItem(DISCARDED_SHARE_KEY, "");
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
type ShareRouteDecision =
  | { action: "open-share" }
  | { action: "defer-onboarding"; markPending: true }
  | { action: "defer-sign-in"; markPending: true; href: "/(auth)/sign-in" };

export function decideShareRoute(state: {
  onboarded: boolean;
  isAuthenticated: boolean;
}): ShareRouteDecision {
  if (state.onboarded && state.isAuthenticated) {
    return { action: "open-share" };
  }
  if (!state.onboarded) {
    return { action: "defer-onboarding", markPending: true };
  }
  return {
    action: "defer-sign-in",
    markPending: true,
    href: "/(auth)/sign-in",
  };
}

/**
 * After onboarding completes and/or the user signs in, choose the next route.
 * A pending share wins over the default home landing so the Share Sheet is not
 * silently dropped. A resumable payload batch wins for the same reason: on an
 * Android cold start the launch URL can be lost to Expo Router's initial-URL
 * race, and a relaunch after a mid-share process death can find the batch
 * still sitting in the native store. Either way the share screen is owed a
 * visit — its own session reconciliation decides whether the batch is a new
 * save, a resume of an interrupted one, or a stale completed record to clear.
 * A batch whose explicit discard left it behind is not resumable (see the
 * discard record), so the hook stays home over it.
 */
export function decidePostAuthRoute(state: {
  hasPendingShare: boolean;
  hasResumableSharePayloads: boolean;
}): "/" | "/share" {
  return state.hasPendingShare || state.hasResumableSharePayloads
    ? "/share"
    : "/";
}

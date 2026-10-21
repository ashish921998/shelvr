import * as SecureStore from "expo-secure-store";

// A purchase made in onboarding before sign-in belongs to an anonymous
// RevenueCat customer until the account signs in. This flag survives an app
// kill between the two, so the first signed-in launch still asks the backend
// to read the aliased purchase (and the replay does not sell it again).
// It stays until the backend confirms the account has access, so a read that
// races the store receipt is tried again rather than forgotten.
// Cleared with setItem('') because SecureStore's delete is async-only.
const KEY = "shelvr.purchase.beforeSignIn";
// When an account first claimed the purchase, so a purchase that never
// reaches it (refunded, or an Ask to Buy that was declined) stops holding the
// replay. Counted from the claim, not the purchase, so a late sign-in still
// gets its full round of attempts.
const AT_KEY = "shelvr.purchase.beforeSignIn.at";

/** How long a claimed purchase that has not reached the account is still
 * tried: the trial's length. After it the person still has Restore Purchases. */
export const PURCHASE_ATTACH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// "1" until an account signs in; then that account's id, so the purchase is
// only ever attached to the first account that signs in after it.
const UNCLAIMED = "1";
const OWNER_PREFIX = "user:";

// SecureStore is not reactive. The onboarding replay waits on this flag, so
// it subscribes and wakes when the flag is cleared.
let revision = 0;
const listeners = new Set<() => void>();

function write(value: string) {
  SecureStore.setItem(KEY, value);
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribePurchaseBeforeSignIn(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPurchaseBeforeSignInRevision(): number {
  return revision;
}

export function notePurchaseBeforeSignIn() {
  try {
    write(UNCLAIMED);
  } catch {
    // Best effort: the webhook still lands at the next renewal, and Restore
    // Purchases attaches it at once.
  }
}

function read(): string | null {
  try {
    const value = SecureStore.getItem(KEY);
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

export function hasPurchaseBeforeSignIn(): boolean {
  return read() !== null;
}

/** True once the claim is older than {@link PURCHASE_ATTACH_WINDOW_MS}. A
 * claim with no time (written before the time was kept) starts its window now. */
function attachWindowEnded(): boolean {
  try {
    const at = Number(SecureStore.getItem(AT_KEY) || NaN);
    if (!Number.isFinite(at)) {
      SecureStore.setItem(AT_KEY, String(Date.now()));
      return false;
    }
    return Date.now() - at > PURCHASE_ATTACH_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * True when the purchase is this account's to attach: the first account to
 * sign in after it claims it. Another account that signs in later on the same
 * device (the first one's attach failed, then it signed out) drops the flag
 * instead, so the store receipt is never moved onto it. The first account
 * still has Restore Purchases.
 */
export function claimPurchaseBeforeSignIn(
  userId: string,
  onExpired?: () => void,
): boolean {
  const value = read();
  if (value === null) return false;
  const owner = OWNER_PREFIX + userId;
  if (value === owner) {
    if (!attachWindowEnded()) return true;
    clearPurchaseBeforeSignIn();
    onExpired?.();
    return false;
  }
  if (value !== UNCLAIMED) {
    clearPurchaseBeforeSignIn();
    return false;
  }
  try {
    SecureStore.setItem(AT_KEY, String(Date.now()));
    write(owner);
  } catch {
    // Unclaimed still attaches now; only a later account switch is at risk.
  }
  return true;
}

export function clearPurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(AT_KEY, "");
    write("");
  } catch {
    // Best effort; a stale flag only re-runs one harmless sync.
  }
}

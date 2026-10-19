import * as SecureStore from "expo-secure-store";

// A purchase made in onboarding before sign-in belongs to an anonymous
// RevenueCat customer until the account signs in. This flag survives an app
// kill between the two, so the first signed-in launch still asks the backend
// to read the aliased purchase (and the replay does not sell it again).
// Cleared with setItem('') because SecureStore's delete is async-only.
const KEY = "shelvr.purchase.beforeSignIn";

// "1" until an account signs in; then that account's id, so the purchase is
// only ever attached to the first account that signs in after it.
const UNCLAIMED = "1";
const OWNER_PREFIX = "user:";

export function notePurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(KEY, UNCLAIMED);
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

/**
 * True when the purchase is this account's to attach: the first account to
 * sign in after it claims it. Another account that signs in later on the same
 * device (the first one's attach failed, then it signed out) drops the flag
 * instead, so the store receipt is never moved onto it. The first account
 * still has Restore Purchases.
 */
export function claimPurchaseBeforeSignIn(userId: string): boolean {
  const value = read();
  if (value === null) return false;
  const owner = OWNER_PREFIX + userId;
  if (value === owner) return true;
  if (value !== UNCLAIMED) {
    clearPurchaseBeforeSignIn();
    return false;
  }
  try {
    SecureStore.setItem(KEY, owner);
  } catch {
    // Unclaimed still attaches now; only a later account switch is at risk.
  }
  return true;
}

export function clearPurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(KEY, "");
  } catch {
    // Best effort; a stale flag only re-runs one harmless sync.
  }
}

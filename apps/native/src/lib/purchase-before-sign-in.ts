import * as SecureStore from "expo-secure-store";

// A purchase made in onboarding before sign-in belongs to an anonymous
// RevenueCat customer until the account signs in. This flag survives an app
// kill between the two, so the first signed-in launch still asks the backend
// to read the aliased purchase (and the replay does not sell it again).
// Cleared with setItem('') because SecureStore's delete is async-only.
const KEY = "shelvr.purchase.beforeSignIn";

export function notePurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(KEY, "1");
  } catch {
    // Best effort: the webhook still lands at the next renewal, and Restore
    // Purchases attaches it at once.
  }
}

export function hasPurchaseBeforeSignIn(): boolean {
  try {
    return SecureStore.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(KEY, "");
  } catch {
    // Best effort; a stale flag only re-runs one harmless sync.
  }
}

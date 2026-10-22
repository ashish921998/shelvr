import * as SecureStore from "expo-secure-store";

const KEY = "shelvr.purchase.beforeSignIn";
const AT_KEY = "shelvr.purchase.beforeSignIn.at";

export const PURCHASE_ATTACH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const UNCLAIMED = "1";
const OWNER_PREFIX = "user:";

// SecureStore is not reactive; subscribers wake on this revision.
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
  } catch {}
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

/** True when this account may attach the purchase: the first to sign in claims it, a later account drops the flag. */
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
  } catch {}
  return true;
}

// SecureStore's delete is async-only, so clearing writes "".
export function clearPurchaseBeforeSignIn() {
  try {
    SecureStore.setItem(AT_KEY, "");
    write("");
  } catch {}
}

export const PENDING_SHARE_KEY = "shelvr.pending.share";

export interface PendingShareStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function markPendingShareInStore(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, "1");
}

export function hasPendingShareInStore(store: PendingShareStore): boolean {
  const value = store.getItem(PENDING_SHARE_KEY);
  return value === "1";
}

export function clearPendingShareInStore(store: PendingShareStore): void {
  store.setItem(PENDING_SHARE_KEY, "");
}

export const DISCARDED_SHARE_KEY = "shelvr.discarded.share";

export function markShareDiscardedInStore(
  store: PendingShareStore,
  fingerprint: string,
): void {
  store.setItem(DISCARDED_SHARE_KEY, fingerprint);
}

export function shareWasDiscardedInStore(
  store: PendingShareStore,
  fingerprint: string,
): boolean {
  return store.getItem(DISCARDED_SHARE_KEY) === fingerprint;
}

export function clearShareDiscardedInStore(store: PendingShareStore): void {
  store.setItem(DISCARDED_SHARE_KEY, "");
}

export function decidePostAuthRoute(state: {
  hasOwedShare: boolean;
}): "/" | "/share" {
  return state.hasOwedShare ? "/share" : "/";
}

import * as SecureStore from "expo-secure-store";

const PENDING_INVITE_KEY = "shelvr.pending.invite";

let revision = 0;
const listeners = new Set<() => void>();

function notifyChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribePendingInvite(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingInviteRevision(): number {
  return revision;
}

export function getPendingInvite(): string | null {
  try {
    const token = SecureStore.getItem(PENDING_INVITE_KEY);
    return token === null || token === "" ? null : token;
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string): void {
  SecureStore.setItem(PENDING_INVITE_KEY, token);
  notifyChanged();
}

export function clearPendingInvite(): void {
  SecureStore.setItem(PENDING_INVITE_KEY, "");
  notifyChanged();
}

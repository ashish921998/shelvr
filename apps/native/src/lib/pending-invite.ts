import * as SecureStore from "expo-secure-store";

const PENDING_INVITE_KEY = "shelvr.pending.invite";

const listeners = new Set<() => void>();

function notifyChanged() {
  for (const listener of listeners) listener();
}

export function subscribePendingInvite(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

const PASSPORT_PREFIX = "passport:";

export type PendingInvite =
  | { kind: "list"; token: string }
  | { kind: "passport"; token: string };

export function pendingInviteOf(raw: string): PendingInvite {
  return raw.startsWith(PASSPORT_PREFIX)
    ? { kind: "passport", token: raw.slice(PASSPORT_PREFIX.length) }
    : { kind: "list", token: raw };
}

export function setPendingPassport(token: string): void {
  setPendingInvite(`${PASSPORT_PREFIX}${token}`);
}

export function clearPendingInvite(): void {
  SecureStore.setItem(PENDING_INVITE_KEY, "");
  notifyChanged();
}

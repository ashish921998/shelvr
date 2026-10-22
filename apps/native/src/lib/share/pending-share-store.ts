/**
 * Device binding for the pending-share flag and the discarded-share record.
 * SecureStore keeps both across process death the same way onboarding and
 * pending-onboarding do. Empty string means "not set" because SecureStore's
 * delete is async-only.
 */
import * as SecureStore from "expo-secure-store";
import {
  clearPendingShareInStore,
  clearShareDiscardedInStore,
  hasPendingShareInStore,
  markPendingShareInStore,
  markShareDiscardedInStore,
  shareWasDiscardedInStore,
  type PendingShareStore,
} from "@/lib/share/pending-share";

const secureStore: PendingShareStore = {
  getItem: (key) => {
    const value = SecureStore.getItem(key);
    return value === null || value === "" ? null : value;
  },
  setItem: (key, value) => {
    SecureStore.setItem(key, value);
  },
};

export function markPendingShareOnDevice(): void {
  markPendingShareInStore(secureStore);
}

export function hasPendingShareOnDevice(): boolean {
  return hasPendingShareInStore(secureStore);
}

export function clearPendingShareOnDevice(): void {
  clearPendingShareInStore(secureStore);
}

export function markShareDiscardedOnDevice(fingerprint: string): void {
  markShareDiscardedInStore(secureStore, fingerprint);
}

export function shareWasDiscardedOnDevice(fingerprint: string): boolean {
  return shareWasDiscardedInStore(secureStore, fingerprint);
}

export function clearShareDiscardedOnDevice(): void {
  clearShareDiscardedInStore(secureStore);
}

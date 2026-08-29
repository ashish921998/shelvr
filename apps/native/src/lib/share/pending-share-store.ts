/**
 * Device binding for the pending-share flag. SecureStore keeps the flag across
 * process death the same way onboarding and pending-onboarding do. Empty string
 * means "not set" because SecureStore's delete is async-only.
 */
import * as SecureStore from 'expo-secure-store';
import {
  clearPendingShareInStore,
  hasPendingShareInStore,
  markPendingShareInStore,
  type PendingShareStore,
} from '@/lib/share/pending-share';

const secureStore: PendingShareStore = {
  getItem: (key) => {
    const value = SecureStore.getItem(key);
    return value === null || value === '' ? null : value;
  },
  setItem: (key, value) => {
    SecureStore.setItem(key, value);
  },
};

/** Persist the pending-share flag in device SecureStore. */
export function markPendingShareOnDevice(): void {
  markPendingShareInStore(secureStore);
}

/** Read the pending-share flag from device SecureStore. */
export function hasPendingShareOnDevice(): boolean {
  return hasPendingShareInStore(secureStore);
}

/** Clear the pending-share flag in device SecureStore without deleting its key. */
export function clearPendingShareOnDevice(): void {
  clearPendingShareInStore(secureStore);
}

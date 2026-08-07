/**
 * Device binding for the pending-share flag. SecureStore keeps the flag across
 * process death the same way onboarding and pending-onboarding do. Empty string
 * means "not set" because SecureStore's delete is async-only.
 */
import * as SecureStore from 'expo-secure-store';
import {
  clearPendingShare as clearPendingSharePure,
  consumePendingShare as consumePendingSharePure,
  hasPendingShare as hasPendingSharePure,
  markPendingShare as markPendingSharePure,
  type PendingShareStore,
} from './pending-share';

const secureStore: PendingShareStore = {
  getItem: (key) => {
    const value = SecureStore.getItem(key);
    return value === null || value === '' ? null : value;
  },
  setItem: (key, value) => {
    SecureStore.setItem(key, value);
  },
};

export function markPendingShare(): void {
  markPendingSharePure(secureStore);
}

export function hasPendingShare(): boolean {
  return hasPendingSharePure(secureStore);
}

export function consumePendingShare(): boolean {
  return consumePendingSharePure(secureStore);
}

export function clearPendingShare(): void {
  clearPendingSharePure(secureStore);
}

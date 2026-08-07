import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Persisted store for onboarding choices made before the user signs in.
// Onboarding runs without auth — spaces and the demo link can't be created
// via Convex until after sign-in, so we stash them here and replay on the
// other side. Backed by SecureStore so the data survives an app kill (iOS
// can and does kill backgrounded apps). The same pattern onboarding.ts uses
// for the `onboarded` flag. Clears use setItem('') because SecureStore's
// delete is async-only; getters treat empty as "not set".

const SPACES_KEY = 'shelvr.pending.spaces';
const DEMO_URL_KEY = 'shelvr.pending.demoUrl';
const OPERATION_ID_KEY = 'shelvr.pending.operationId';

let revision = 0;
const listeners = new Set<() => void>();

function notifyChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribePendingOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingOnboardingRevision(): number {
  return revision;
}

function ensureOperationId(): string {
  const existing = SecureStore.getItem(OPERATION_ID_KEY);
  if (existing !== null && existing !== '') return existing;
  const operationId = `onboarding:${Crypto.randomUUID()}`;
  SecureStore.setItem(OPERATION_ID_KEY, operationId);
  return operationId;
}

export function setPendingSpaces(spaces: string[]) {
  if (spaces.length > 0) ensureOperationId();
  SecureStore.setItem(SPACES_KEY, JSON.stringify(spaces));
  notifyChanged();
}

export function getPendingSpaces(): string[] {
  const raw = SecureStore.getItem(SPACES_KEY);
  if (raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setPendingDemoUrl(url: string | null) {
  if (url !== null) ensureOperationId();
  SecureStore.setItem(DEMO_URL_KEY, url ?? '');
  notifyChanged();
}

export function getOrCreatePendingOperationId(): string {
  return ensureOperationId();
}

export function getPendingDemoUrl(): string | null {
  const value = SecureStore.getItem(DEMO_URL_KEY);
  return value === null || value === '' ? null : value;
}

export function hasPending(): boolean {
  return getPendingSpaces().length > 0 || getPendingDemoUrl() !== null;
}

export function clearPending() {
  SecureStore.setItem(SPACES_KEY, '');
  SecureStore.setItem(DEMO_URL_KEY, '');
  SecureStore.setItem(OPERATION_ID_KEY, '');
  notifyChanged();
}

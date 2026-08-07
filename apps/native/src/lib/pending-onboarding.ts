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
const REPLAYED_KEY = 'shelvr.pending.replayed';

export function setPendingSpaces(spaces: string[]) {
  SecureStore.setItem(SPACES_KEY, JSON.stringify(spaces));
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
  SecureStore.setItem(DEMO_URL_KEY, url ?? '');
}

export function getPendingDemoUrl(): string | null {
  const value = SecureStore.getItem(DEMO_URL_KEY);
  return value === null || value === '' ? null : value;
}

export function hasPending(): boolean {
  return getPendingSpaces().length > 0 || getPendingDemoUrl() !== null;
}

export function markReplayed() {
  SecureStore.setItem(REPLAYED_KEY, 'true');
}

export function isReplayed(): boolean {
  return SecureStore.getItem(REPLAYED_KEY) === 'true';
}

export function clearPending() {
  SecureStore.setItem(SPACES_KEY, '');
  SecureStore.setItem(DEMO_URL_KEY, '');
  SecureStore.setItem(REPLAYED_KEY, '');
}

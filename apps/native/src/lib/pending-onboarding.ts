import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Persisted store for onboarding choices made before the user signs in.
// Onboarding runs without auth — spaces and the demo link can't be created
// via Convex until after sign-in, so we stash them here and replay on the
// other side. Backed by SecureStore so the data survives an app kill (iOS
// can and does kill backgrounded apps). The same pattern onboarding.ts uses
// for the `onboarded` flag. Clears use setItem('') because SecureStore's
// delete is async-only; getters treat empty as "not set".

const PENDING_KEY = 'shelvr.pending.onboarding';

type PendingRecord = {
  operationId: string;
  spaces: string[];
  demoUrl: string | null;
};

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

function createOperationId(): string {
  return `onboarding:${Crypto.randomUUID()}`;
}

function readPendingRecord(): PendingRecord | null {
  const raw = SecureStore.getItem(PENDING_KEY);
  if (raw === null || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<PendingRecord>;
    if (
      typeof record.operationId !== 'string' ||
      record.operationId === '' ||
      !Array.isArray(record.spaces) ||
      !record.spaces.every((space): space is string => typeof space === 'string') ||
      (record.demoUrl !== null && typeof record.demoUrl !== 'string')
    ) {
      return null;
    }
    return {
      operationId: record.operationId,
      spaces: record.spaces,
      demoUrl: record.demoUrl === '' ? null : record.demoUrl,
    };
  } catch {
    return null;
  }
}

function writePendingRecord(record: PendingRecord | null) {
  SecureStore.setItem(PENDING_KEY, record === null ? '' : JSON.stringify(record));
}

function ensureOperationId(): string {
  const existing = readPendingRecord();
  if (existing !== null) return existing.operationId;
  const operationId = createOperationId();
  writePendingRecord({ operationId, spaces: [], demoUrl: null });
  return operationId;
}

function writePendingSpaces(spaces: string[], refreshOperationId: boolean) {
  const existing = readPendingRecord();
  const operationId =
    spaces.length > 0 && refreshOperationId
      ? createOperationId()
      : existing?.operationId ?? createOperationId();
  const demoUrl = existing?.demoUrl ?? null;
  writePendingRecord(
    spaces.length === 0 && demoUrl === null
      ? null
      : { operationId, spaces, demoUrl },
  );
  notifyChanged();
}

export function setPendingSpaces(spaces: string[]) {
  writePendingSpaces(spaces, true);
}

// Replay retries update the existing operation rather than starting a new one;
// otherwise a successfully-created demo link could be duplicated after a
// partial space-creation failure.
export function updatePendingSpaces(spaces: string[]) {
  writePendingSpaces(spaces, false);
}

export function getPendingSpaces(): string[] {
  return readPendingRecord()?.spaces ?? [];
}

export function setPendingDemoUrl(url: string | null) {
  const existing = readPendingRecord();
  const spaces = existing?.spaces ?? [];
  const demoUrl = url === null || url === '' ? null : url;
  const operationId =
    demoUrl !== null
      ? createOperationId()
      : existing?.operationId ?? createOperationId();
  writePendingRecord(
    spaces.length === 0 && demoUrl === null
      ? null
      : { operationId, spaces, demoUrl },
  );
  notifyChanged();
}

export function getOrCreatePendingOperationId(): string {
  return ensureOperationId();
}

export function getPendingDemoUrl(): string | null {
  return readPendingRecord()?.demoUrl ?? null;
}

export function hasPending(): boolean {
  return getPendingSpaces().length > 0 || getPendingDemoUrl() !== null;
}

export function clearPending() {
  writePendingRecord(null);
  notifyChanged();
}

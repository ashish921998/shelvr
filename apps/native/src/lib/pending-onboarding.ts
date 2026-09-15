import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { onboardingLabel } from "./onboarding-labels";

// Persisted store for onboarding state that must survive leaving the screen
// (the demo step's inline OAuth) or an app kill: the picked library
// categories, quiz answers, current step, and an in-flight demo save. The
// same record later drives the post-sign-in replay in lib/replay-onboarding
// .ts. Backed by SecureStore so the data survives an app kill (iOS can and
// does kill backgrounded apps). Clears use setItem('') because SecureStore's
// delete is async-only; getters treat empty as "not set".

const PENDING_KEY = "shelvr.pending.onboarding";

/** The demo step's in-flight save, so an app kill mid-OAuth (or a relaunch
 * while the save is still processing) resumes the exact save the user asked
 * for. Scoped to the demo step: the step clears it when it advances (or
 * skips), and `setPendingSpaces` — the finish path — drops it too, so a
 * completed save is never replayed or left behind in SecureStore. */
export type PendingDemo = {
  url: string;
  /** The demo's explicit single destination ("just my shelf" when null). */
  destination: string | null;
};

type PendingRecord = {
  operationId: string;
  spaces: string[];
  demoUrl: string | null;
  q1: string[];
  q2: string[];
  step: number | null;
  demo: PendingDemo | null;
  spaceNames: Record<string, string>;
};

/** What onboarding.tsx restores on mount. */
type OnboardingProgress = {
  q1: string[];
  q2: string[];
  spaces: string[];
  step: number | null;
  demo: PendingDemo | null;
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
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<PendingRecord>;
    const stringArray = (value: unknown): string[] | null =>
      Array.isArray(value) &&
      value.every((v): v is string => typeof v === "string")
        ? value
        : null;
    const spaces = stringArray(record.spaces);
    const q1 = stringArray(record.q1) ?? [];
    const q2 = stringArray(record.q2) ?? [];
    const step = typeof record.step === "number" ? record.step : null;
    const demo =
      record.demo !== null &&
      typeof record.demo === "object" &&
      typeof record.demo.url === "string" &&
      (record.demo.destination === null ||
        typeof record.demo.destination === "string")
        ? record.demo
        : null;
    if (
      typeof record.operationId !== "string" ||
      record.operationId === "" ||
      spaces === null ||
      (record.demoUrl !== null && typeof record.demoUrl !== "string")
    ) {
      return null;
    }
    return {
      operationId: record.operationId,
      spaces,
      demoUrl: record.demoUrl === "" ? null : record.demoUrl,
      q1,
      q2,
      step,
      demo,
      spaceNames: readSpaceNames(record.spaceNames),
    };
  } catch {
    return null;
  }
}

function readSpaceNames(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function writePendingRecord(record: PendingRecord | null) {
  SecureStore.setItem(
    PENDING_KEY,
    record === null ? "" : JSON.stringify(record),
  );
}

function ensureOperationId(): string {
  const existing = readPendingRecord();
  if (existing !== null) return existing.operationId;
  const operationId = createOperationId();
  writePendingRecord({
    operationId,
    spaces: [],
    demoUrl: null,
    q1: [],
    q2: [],
    step: null,
    demo: null,
    spaceNames: {},
  });
  return operationId;
}

// Replay retries (refreshOperationId=false) update the existing operation
// rather than starting a new one; otherwise a successfully-created demo link
// could be duplicated after a partial space-creation failure.
function writePendingSpaces(
  spaces: string[],
  refreshOperationId: boolean,
  demo: PendingDemo | null,
) {
  const existing = readPendingRecord();
  const operationId =
    spaces.length > 0 && refreshOperationId && !existing?.demoUrl
      ? createOperationId()
      : (existing?.operationId ?? createOperationId());
  writePendingRecord({
    operationId,
    spaces,
    demoUrl: existing?.demoUrl ?? null,
    q1: existing?.q1 ?? [],
    q2: existing?.q2 ?? [],
    step: existing?.step ?? null,
    demo,
    spaceNames: existing?.spaceNames ?? {},
  });
  notifyChanged();
}

/** Onboarding finished: hand the picked spaces to the replay hook. The demo
 * step is over, so its in-flight record is dropped here as well — otherwise a
 * completed save would outlive onboarding in SecureStore (`hasPending` ignores
 * it, so nothing downstream would ever clear it). */
export function setPendingSpaces(spaces: string[]) {
  writePendingSpaces(spaces, true, null);
}

export function updatePendingSpaces(spaces: string[]) {
  writePendingSpaces(spaces, false, readPendingRecord()?.demo ?? null);
}

export function getPendingSpaces(): string[] {
  return readPendingRecord()?.spaces ?? [];
}

export function getOrCreatePendingOperationId(): string {
  return ensureOperationId();
}

/** Older builds queued this save until purchase. Preserve that intent. */
export function getPendingDemoUrl(): string | null {
  return readPendingRecord()?.demoUrl ?? null;
}

export function clearLegacyDemoUrl() {
  const existing = readPendingRecord();
  if (existing === null || existing.demoUrl === null) return;
  writePendingRecord({ ...existing, demoUrl: null });
  notifyChanged();
}

export function clearLegacyDemoUrlIfSaved(savedUrl: string) {
  const queued = getPendingDemoUrl();
  if (!queued) return;
  try {
    if (new URL(queued).href === new URL(savedUrl).href) clearLegacyDemoUrl();
  } catch {
    // An invalid old URL remains recoverable instead of being silently lost.
  }
}

export function getOnboardingProgress(): OnboardingProgress {
  const record = readPendingRecord();
  return {
    q1: record?.q1 ?? [],
    q2: record?.q2 ?? [],
    spaces: record?.spaces ?? [],
    step: record?.step ?? null,
    demo: record?.demo ?? null,
  };
}

export function setOnboardingProgress(progress: {
  q1: string[];
  q2: string[];
  spaces: string[];
  step: number;
}) {
  const existing = readPendingRecord();
  const operationId = existing?.operationId ?? createOperationId();
  writePendingRecord({
    operationId,
    spaces: progress.spaces,
    demoUrl: existing?.demoUrl ?? null,
    q1: progress.q1,
    q2: progress.q2,
    step: progress.step,
    demo: existing?.demo ?? null,
    spaceNames: existing?.spaceNames ?? {},
  });
  notifyChanged();
}

export function setPendingDemo(demo: PendingDemo | null) {
  const existing = readPendingRecord();
  if (existing === null && demo === null) return;
  const operationId = existing?.operationId ?? createOperationId();
  writePendingRecord({
    operationId,
    spaces: existing?.spaces ?? [],
    demoUrl: existing?.demoUrl ?? null,
    q1: existing?.q1 ?? [],
    q2: existing?.q2 ?? [],
    step: existing?.step ?? null,
    demo,
    spaceNames: existing?.spaceNames ?? {},
  });
  notifyChanged();
}

export function hasPending(): boolean {
  const record = readPendingRecord();
  return (
    record !== null && (record.spaces.length > 0 || record.demoUrl !== null)
  );
}

/** Freeze a preset's persisted name before its first creation. Display labels
 * may change language, but demo and completion must use the same identity. */
export function resolveOnboardingSpaceName(id: string): string {
  ensureOperationId();
  const record = readPendingRecord();
  if (record === null) throw new Error("Onboarding state unavailable");
  if (Object.hasOwn(record.spaceNames, id)) return record.spaceNames[id];
  const name = onboardingLabel(id);
  writePendingRecord({
    ...record,
    spaceNames: { ...record.spaceNames, [id]: name },
  });
  return name;
}

export function clearPending() {
  writePendingRecord(null);
  notifyChanged();
}

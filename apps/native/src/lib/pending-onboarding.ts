import type { Id } from "@convex/_generated/dataModel";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { onboardingLabel } from "@/lib/onboarding-labels";

// Persisted store for onboarding state that must survive leaving the screen
// (the demo step's inline OAuth) or an app kill: the picked library
// categories, the picked save kinds, current step, and an in-flight demo save. The
// same record later drives the post-sign-in replay in lib/replay-onboarding
// .ts. Backed by SecureStore so the data survives an app kill (iOS can and
// does kill backgrounded apps). Clears use setItem('') because SecureStore's
// delete is async-only; getters treat empty as "not set".

const PENDING_KEY = "shelvr.pending.onboarding";

// Older flows stored `step` as an index into a different step list, under the
// same key. Their step and answers are ignored so progress restarts at the
// opener; the replay fields (operationId, spaces, demoUrl) still apply.
// Version 3 inserted the acquisition source step after the opener, 4 the
// notifications step before the reveal. 5 removed the source step, inserted
// the interests step after the opener and added the share step. 6 removed
// the reveal step.
const PROGRESS_VERSION = 6;

/** The demo step's in-flight save, so an app kill mid-OAuth (or a relaunch
 * while the save is still processing) resumes the exact save the user asked
 * for. It is kept after the demo step advances so the share practice can
 * avoid offering the same link again. Cancelling the demo's sign-in clears
 * it, and `setPendingSpaces` (the finish path) drops it, so a completed save
 * is never replayed or left behind in SecureStore. */
export type PendingDemo = {
  url: string;
  /** The demo's explicit single destination ("just my shelf" when null). */
  destination: string | null;
  /** Only a URL received through Shelvr's share extension counts as a share. */
  source: "direct" | "share";
};

/** The demo's finished save, so a relaunch on the reminder step still has
 * the save to remind about. Dropped with the demo when onboarding finishes. */
type PendingSaved = {
  itemId: Id<"items">;
  savedSpaceNames: string[];
};

type PendingRecord = {
  operationId: string;
  spaces: string[];
  demoUrl: string | null;
  /** The space `demoUrl` was picked for; null for the shelf alone, and on
   * records written before it was kept. */
  demoSpace: string | null;
  /** The account `demoUrl` was handed over for, so it never lands in another
   * one; null on records written before it was kept. */
  demoOwner: string | null;
  /** Absent on records written by an older flow. */
  progressVersion: number | null;
  saveKinds: string[];
  step: number | null;
  demo: PendingDemo | null;
  /** Absent on records written before the save was kept. */
  saved: PendingSaved | null;
  spaceNames: Record<string, string>;
  /** The city picked for the sample trip; absent until one is picked. */
  travelCity?: string | null;
};

/** What onboarding.tsx restores on mount. */
type OnboardingProgress = {
  saveKinds: string[];
  spaces: string[];
  travelCity: string | null;
  step: number | null;
  demo: PendingDemo | null;
  saved: PendingSaved | null;
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
    const saveKinds = stringArray(record.saveKinds) ?? [];
    const step = typeof record.step === "number" ? record.step : null;
    const storedDemo =
      record.demo !== null &&
      typeof record.demo === "object" &&
      typeof record.demo.url === "string" &&
      (record.demo.destination === null ||
        typeof record.demo.destination === "string")
        ? record.demo
        : null;
    // Builds before the first-share fix did not persist origin. Treat those
    // records as direct saves rather than hiding guidance on an assumption.
    const demo: PendingDemo | null =
      storedDemo === null
        ? null
        : {
            url: storedDemo.url,
            destination: storedDemo.destination,
            source: storedDemo.source === "share" ? "share" : "direct",
          };
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
      demoSpace:
        typeof record.demoSpace === "string" && record.demoSpace !== ""
          ? record.demoSpace
          : null,
      demoOwner:
        typeof record.demoOwner === "string" && record.demoOwner !== ""
          ? record.demoOwner
          : null,
      progressVersion:
        typeof record.progressVersion === "number"
          ? record.progressVersion
          : null,
      saveKinds,
      step,
      demo,
      saved: readSaved(record.saved),
      spaceNames: readSpaceNames(record.spaceNames),
      travelCity:
        typeof record.travelCity === "string" && record.travelCity !== ""
          ? record.travelCity
          : null,
    };
  } catch {
    return null;
  }
}

function readSaved(value: unknown): PendingSaved | null {
  if (typeof value !== "object" || value === null) return null;
  const { itemId, savedSpaceNames } = value as Partial<PendingSaved>;
  if (typeof itemId !== "string" || itemId === "") return null;
  if (
    !Array.isArray(savedSpaceNames) ||
    !savedSpaceNames.every((name) => typeof name === "string")
  )
    return null;
  return { itemId, savedSpaceNames };
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

export function getOrCreatePendingOperationId(): string {
  const existing = readPendingRecord();
  if (existing !== null) return existing.operationId;
  const operationId = createOperationId();
  writePendingRecord({
    operationId,
    spaces: [],
    demoUrl: null,
    demoSpace: null,
    demoOwner: null,
    progressVersion: null,
    saveKinds: [],
    step: null,
    demo: null,
    saved: null,
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
  saved: PendingSaved | null,
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
    demoSpace: existing?.demoSpace ?? null,
    demoOwner: existing?.demoOwner ?? null,
    progressVersion: existing?.progressVersion ?? null,
    saveKinds: existing?.saveKinds ?? [],
    step: existing?.step ?? null,
    demo,
    saved,
    spaceNames: existing?.spaceNames ?? {},
    travelCity: existing?.travelCity ?? null,
  });
  notifyChanged();
}

/** Onboarding finished: hand the picked spaces to the replay hook. The demo
 * step is over, so its in-flight record is dropped here as well — otherwise a
 * completed save would outlive onboarding in SecureStore (`hasPending` ignores
 * it, so nothing downstream would ever clear it). */
export function setPendingSpaces(spaces: string[]) {
  writePendingSpaces(spaces, true, null, null);
}

export function updatePendingSpaces(spaces: string[]) {
  const existing = readPendingRecord();
  writePendingSpaces(
    spaces,
    false,
    existing?.demo ?? null,
    existing?.saved ?? null,
  );
}

export function getPendingSpaces(): string[] {
  return readPendingRecord()?.spaces ?? [];
}

/** Read-only: unlike getOrCreatePendingOperationId, never writes a record. */
export function getPendingOperationId(): string | null {
  return readPendingRecord()?.operationId ?? null;
}

/** A first save queued until sign-in and purchase (older builds queued one
 * too). */
export function getPendingDemoUrl(): string | null {
  return readPendingRecord()?.demoUrl ?? null;
}

/** The space the queued first save was picked for, if any. */
export function getPendingDemoSpace(): string | null {
  return readPendingRecord()?.demoSpace ?? null;
}

/** The account the queued first save belongs to; null when unknown. */
export function getPendingDemoOwner(): string | null {
  return readPendingRecord()?.demoOwner ?? null;
}

/** A first save the replay makes once the account is Pro, filed into the
 * space it was picked for: one queued before sign-in whose account had
 * already spent its free demo save (queued-first-save.ts). `owner` is that
 * account, so the link never lands in an account that signs in after it. */
export function queueDemoUrl(
  url: string,
  space: string | null = null,
  owner: string | null = null,
) {
  getOrCreatePendingOperationId();
  const existing = readPendingRecord();
  if (existing === null) return;
  writePendingRecord({
    ...existing,
    demoUrl: url,
    demoSpace: space,
    demoOwner: owner,
  });
  notifyChanged();
}

export function clearLegacyDemoUrl() {
  const existing = readPendingRecord();
  if (existing === null || existing.demoUrl === null) return;
  writePendingRecord({
    ...existing,
    demoUrl: null,
    demoSpace: null,
    demoOwner: null,
  });
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

function isCurrentProgress(record: PendingRecord | null): boolean {
  return record?.progressVersion === PROGRESS_VERSION;
}

export function getOnboardingProgress(): OnboardingProgress {
  const record = readPendingRecord();
  if (record === null || !isCurrentProgress(record)) {
    return {
      saveKinds: [],
      spaces: [],
      travelCity: null,
      step: null,
      demo: null,
      saved: null,
    };
  }
  return {
    saveKinds: record.saveKinds,
    spaces: record.spaces,
    travelCity: record.travelCity ?? null,
    step: record.step,
    demo: record.demo,
    saved: record.saved,
  };
}

export function setOnboardingProgress(progress: {
  saveKinds: string[];
  spaces: string[];
  travelCity?: string | null;
  step: number;
  saved?: PendingSaved | null;
}) {
  const existing = readPendingRecord();
  const operationId = existing?.operationId ?? createOperationId();
  writePendingRecord({
    operationId,
    spaces: progress.spaces,
    demoUrl: existing?.demoUrl ?? null,
    demoSpace: existing?.demoSpace ?? null,
    demoOwner: existing?.demoOwner ?? null,
    progressVersion: PROGRESS_VERSION,
    saveKinds: progress.saveKinds,
    step: progress.step,
    // An older flow's in-flight demo belongs to a step this flow restarted.
    demo: isCurrentProgress(existing) ? (existing?.demo ?? null) : null,
    saved: progress.saved ?? null,
    spaceNames: existing?.spaceNames ?? {},
    travelCity: progress.travelCity ?? null,
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
    demoSpace: existing?.demoSpace ?? null,
    demoOwner: existing?.demoOwner ?? null,
    progressVersion: existing?.progressVersion ?? null,
    saveKinds: existing?.saveKinds ?? [],
    step: existing?.step ?? null,
    demo,
    saved: existing?.saved ?? null,
    spaceNames: existing?.spaceNames ?? {},
    travelCity: existing?.travelCity ?? null,
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
  getOrCreatePendingOperationId();
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

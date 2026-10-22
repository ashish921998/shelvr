import type { Id } from "@convex/_generated/dataModel";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { isSampleCity, type SampleCityId } from "@/lib/sample-cities";

const PENDING_KEY = "shelvr.pending.onboarding";

const PROGRESS_VERSION = 6;

export type PendingDemo = {
  url: string;
  destination: string | null;
  source: "direct" | "share";
};

type PendingSaved = {
  itemId: Id<"items">;
  savedSpaceNames: string[];
};

type PendingRecord = {
  operationId: string;
  spaces: string[];
  demoUrl: string | null;
  demoSpace: string | null;
  demoOwner: string | null;
  progressVersion: number | null;
  saveKinds: string[];
  step: number | null;
  demo: PendingDemo | null;
  saved: PendingSaved | null;
  spaceNames: Record<string, string>;
  /** The city picked for the sample trip; absent until one is picked. */
  travelCity?: SampleCityId | null;
};

type OnboardingProgress = {
  saveKinds: string[];
  spaces: string[];
  travelCity: SampleCityId | null;
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
      travelCity: isSampleCity(record.travelCity) ? record.travelCity : null,
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

// SecureStore's delete is async-only, so clearing writes ""; readers treat "" as unset.
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

/** Onboarding finished: hands the spaces to the replay hook and drops the in-flight demo and saved record. */
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

export function getPendingOperationId(): string | null {
  return readPendingRecord()?.operationId ?? null;
}

export function getPendingDemoUrl(): string | null {
  return readPendingRecord()?.demoUrl ?? null;
}

export function getPendingDemoSpace(): string | null {
  return readPendingRecord()?.demoSpace ?? null;
}

export function getPendingDemoOwner(): string | null {
  return readPendingRecord()?.demoOwner ?? null;
}

/** Queues a first save for the replay once the account is Pro; `owner` keeps it out of a later account. */
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
  } catch {}
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
  travelCity?: SampleCityId | null;
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

/** Freezes a preset's name on first use, so a language change cannot give demo and completion two names. */
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

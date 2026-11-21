import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState, useSyncExternalStore } from "react";
import { analytics } from "@/lib/analytics";
import { bestEffort } from "@/lib/best-effort";
import { onboardingLabel } from "@/lib/onboarding-labels";
import {
  goalSpaces,
  isSavedCount,
  readGoals,
  type Goal,
  type SavedCount,
} from "@/lib/onboarding-goals";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/onboarding-steps";
import {
  readPurchaseLanding,
  settlePurchaseLanding,
  subscribePurchaseLanding,
} from "@/lib/purchase-landing";
import {
  isSampleCity,
  readSampleCities,
  type SampleCityId,
} from "@/lib/sample-cities";

const HANDOFF_KEY = "shelvr.pending.onboarding";

const LEGACY_PROGRESS_VERSION = 14;

type StoredRecord = {
  operationId: string;
  declinedOperationId?: string | null;
  spaces: string[];
  demoUrl: string | null;
  demoSpace: string | null;
  demoOwner: string | null;
  progressVersion: number | null;
  step: number | null;
  viewed: OnboardingStep[];
  spaceNames: Record<string, string>;
  travelCity?: SampleCityId | null;
  beenCities?: SampleCityId[];
  goals?: Goal[];
  savedCount?: SavedCount | null;
  skippedShare?: boolean;
};

export type OnboardingAnswers = {
  travelCity: SampleCityId | null;
  beenCities: SampleCityId[];
  goals: Goal[];
  savedCount: SavedCount | null;
  skippedShare: boolean;
};

type FirstSave = { url: string; space: string | null; owner: string | null };

export type HandoffWork = {
  has: boolean;
  key: string;
  operationId: string | null;
  spaces: string[];
  firstSave: { url: string; space: string | null } | null;
};

function workKey(
  operationId: string | null,
  spaces: string[],
  firstSaveUrl: string | null,
): string {
  return JSON.stringify([operationId, spaces, firstSaveUrl]);
}

export function parseOnboardingAnswers(
  record: Partial<OnboardingAnswers>,
): OnboardingAnswers {
  return {
    travelCity: isSampleCity(record.travelCity) ? record.travelCity : null,
    beenCities: readSampleCities(record.beenCities),
    goals: readGoals(record.goals),
    savedCount: isSavedCount(record.savedCount) ? record.savedCount : null,
    skippedShare: record.skippedShare === true,
  };
}

let revision = 0;
const listeners = new Set<() => void>();

export function subscribeHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function handoffRevision(): number {
  return revision;
}

function createOperationId(): string {
  return `onboarding:${Crypto.randomUUID()}`;
}

function readRecord(): StoredRecord | null {
  const raw = SecureStore.getItem(HANDOFF_KEY);
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<StoredRecord>;
    const stringArray = (value: unknown): string[] | null =>
      Array.isArray(value) &&
      value.every((v): v is string => typeof v === "string")
        ? value
        : null;
    const spaces = stringArray(record.spaces);
    const step = typeof record.step === "number" ? record.step : null;
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
      declinedOperationId:
        typeof record.declinedOperationId === "string"
          ? record.declinedOperationId
          : null,
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
      step,
      viewed: readViewed(record.viewed),
      spaceNames: readSpaceNames(record.spaceNames),
      ...parseOnboardingAnswers(record),
    };
  } catch {
    return null;
  }
}

function readViewed(value: unknown): OnboardingStep[] {
  return Array.isArray(value)
    ? ONBOARDING_STEPS.filter((step) => value.includes(step))
    : [];
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

function peekRecord(): StoredRecord | null {
  try {
    return readRecord();
  } catch (error) {
    analytics.captureError("onboarding_handoff_read_failed", error);
    return null;
  }
}

function storeRecord(record: StoredRecord | null) {
  SecureStore.setItem(
    HANDOFF_KEY,
    record === null ? "" : JSON.stringify(record),
  );
}

function writeRecord(record: StoredRecord | null) {
  storeRecord(record);
  revision += 1;
  for (const listener of listeners) listener();
}

function firstSaveOf(record: StoredRecord | null): FirstSave | null {
  return record?.demoUrl
    ? { url: record.demoUrl, space: record.demoSpace, owner: record.demoOwner }
    : null;
}

function firstSaveFields(firstSave: FirstSave | null) {
  return {
    demoUrl: firstSave?.url ?? null,
    demoSpace: firstSave?.space ?? null,
    demoOwner: firstSave?.owner ?? null,
  };
}

function keepsOperation(
  existing: StoredRecord,
  firstSave: FirstSave | null,
  spaces: string[],
): boolean {
  const queued = firstSaveOf(existing);
  if (queued === null) return firstSave === null && spaces.length === 0;
  return (
    firstSave !== null &&
    queued.url === firstSave.url &&
    queued.space === firstSave.space &&
    queued.owner === firstSave.owner
  );
}

function operationIdFor(
  existing: StoredRecord | null,
  firstSave: FirstSave | null,
  spaces: string[],
): string {
  return existing !== null && keepsOperation(existing, firstSave, spaces)
    ? existing.operationId
    : createOperationId();
}

function emptyRecord(): StoredRecord {
  return {
    operationId: "",
    spaces: [],
    demoUrl: null,
    demoSpace: null,
    demoOwner: null,
    progressVersion: null,
    step: null,
    viewed: [],
    spaceNames: {},
  };
}

export function finishHandoff(
  answers: OnboardingAnswers,
  firstSaveUrl: string | null,
) {
  bestEffort("onboarding_handoff_finish_failed", () => {
    const existing = readRecord();
    const spaceNames = { ...existing?.spaceNames };
    const ids = goalSpaces(answers.goals);
    for (const id of ids) {
      if (!Object.hasOwn(spaceNames, id)) spaceNames[id] = onboardingLabel(id);
    }
    const spaces = ids.map((id) => spaceNames[id]);
    const firstSave =
      firstSaveUrl === null
        ? firstSaveOf(existing)
        : { url: firstSaveUrl, space: null, owner: null };
    writeRecord({
      operationId: operationIdFor(existing, firstSave, spaces),
      declinedOperationId: existing?.declinedOperationId ?? null,
      spaces,
      ...firstSaveFields(firstSave),
      progressVersion: null,
      step: null,
      viewed: [],
      spaceNames,
      ...parseOnboardingAnswers(answers),
    });
  });
}

export function handOverFirstSave(
  url: string,
  space: string | null = null,
  owner: string | null = null,
) {
  const existing = readRecord();
  const firstSave = { url, space, owner };
  writeRecord({
    ...(existing ?? emptyRecord()),
    operationId: operationIdFor(existing, firstSave, existing?.spaces ?? []),
    ...firstSaveFields(firstSave),
  });
}

export function readHandoffWork(): HandoffWork {
  return workOf(peekRecord());
}

function workOf(record: StoredRecord | null): HandoffWork {
  const firstSave = firstSaveOf(record);
  return {
    has: record !== null && (record.spaces.length > 0 || firstSave !== null),
    key: workKey(
      record?.operationId ?? null,
      record?.spaces ?? [],
      firstSave?.url ?? null,
    ),
    operationId: record?.operationId ?? null,
    spaces: record?.spaces ?? [],
    firstSave:
      firstSave === null
        ? null
        : { url: firstSave.url, space: firstSave.space },
  };
}

export function dropFirstSaveNotFor(account: string | null): boolean {
  try {
    const record = readRecord();
    if (record?.demoOwner == null || record.demoOwner === account) return true;
    writeRecord({ ...record, ...firstSaveFields(null) });
    return true;
  } catch (error) {
    analytics.captureError("onboarding_handoff_drop_failed", error);
    return false;
  }
}

export function firstSaveDone(operationId: string): boolean {
  try {
    const record = readRecord();
    if (record?.operationId === operationId && record.demoUrl !== null) {
      writeRecord({ ...record, ...firstSaveFields(null) });
    }
    return true;
  } catch (error) {
    analytics.captureError("onboarding_first_save_clear_failed", error);
    return false;
  }
}

export function settleHandoff(
  attempted: HandoffWork,
): "cleared" | "changed" | "failed" {
  const done = workKey(attempted.operationId, attempted.spaces, null);
  try {
    if (workOf(readRecord()).key !== done) return "changed";
    writeRecord(null);
    return "cleared";
  } catch (error) {
    analytics.captureError("onboarding_handoff_settle_failed", error);
    return "failed";
  }
}

export function clearHandoff() {
  bestEffort("onboarding_handoff_clear_failed", () => writeRecord(null));
}

export function handoffAnswers(): OnboardingAnswers {
  return parseOnboardingAnswers(peekRecord() ?? {});
}

let onboardingPaywall: "unseen" | "purchased" | "declined" = "unseen";

export function notePaywallAnswer(answer: "purchased" | "declined") {
  onboardingPaywall = answer;
}

export function forgetPaywallAnswer() {
  onboardingPaywall = "unseen";
}

export function paywallBlocked(): boolean {
  if (onboardingPaywall !== "unseen") return true;
  try {
    const record = readRecord();
    return record !== null && record.declinedOperationId === record.operationId;
  } catch (error) {
    analytics.captureError("onboarding_handoff_read_failed", error);
    return true;
  }
}

export function noteReplayDeclined(operationId: string | null) {
  bestEffort("onboarding_replay_decline_save_failed", () => {
    const record = readRecord();
    if (record === null || record.operationId !== operationId) return;
    writeRecord({ ...record, declinedOperationId: operationId });
  });
}

export function useAwaitingOnboardingPurchase(entitled: boolean): boolean {
  const until = useSyncExternalStore(
    subscribePurchaseLanding,
    readPurchaseLanding,
    readPurchaseLanding,
  );
  const [now, setNow] = useState(Date.now);
  const awaiting = !entitled && now < until;
  useEffect(() => {
    if (entitled) {
      settlePurchaseLanding();
      if (onboardingPaywall === "purchased") onboardingPaywall = "unseen";
    }
    if (!awaiting) return;
    const id = setTimeout(() => setNow(Date.now()), until - Date.now());
    return () => clearTimeout(id);
  }, [entitled, awaiting, until, now]);
  return awaiting;
}

export function readLegacyProgress():
  | (OnboardingAnswers & { step: number | null; viewed: OnboardingStep[] })
  | null {
  const record = peekRecord();
  if (record?.progressVersion !== LEGACY_PROGRESS_VERSION) return null;
  return {
    ...parseOnboardingAnswers(record),
    step: record.step,
    viewed: record.viewed,
  };
}

export function dropLegacyProgress() {
  bestEffort("onboarding_legacy_progress_drop_failed", () => {
    const record = readRecord();
    if (record?.progressVersion !== LEGACY_PROGRESS_VERSION) return;
    storeRecord({
      ...record,
      progressVersion: null,
      step: null,
      viewed: [],
      beenCities: [],
      savedCount: null,
      skippedShare: false,
    });
  });
}

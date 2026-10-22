export interface SessionStoreAdapter {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  contains(key: string): boolean;
}
export type RawSharePayload = {
  value: string;
  shareType: string;
  mimeType?: string;
};

export const MAX_SHARE_ENTRIES = 20;
export const MAX_SHARE_TEXT_BYTES = 256 * 1024;

export function shareBatchAllowed(
  payloads: readonly RawSharePayload[],
): boolean {
  if (payloads.length > MAX_SHARE_ENTRIES) return false;
  let bytes = 0;
  for (const payload of payloads) {
    if (payload.value.length > MAX_SHARE_TEXT_BYTES) return false;
    bytes += new TextEncoder().encode(payload.value).byteLength;
    if (bytes > MAX_SHARE_TEXT_BYTES) return false;
  }
  return true;
}

export type ShareEntryKind = "link" | "note" | "image" | "unsupported";

export type ShareEntryStatus = "pending" | "saved" | "failed" | "unsupported";

export type ShareEntry = {
  index: number;
  operationId: string;
  kind: ShareEntryKind;
  status: ShareEntryStatus;
  itemId?: string;
  message?: string;
};

export type ShareSession = {
  version: number;
  fingerprint: string;
  userId: string;
  sessionId: string;
  phase: "active" | "complete";
  entries: ShareEntry[];
};

export const SESSION_SCHEMA_VERSION = 1;

const ENTRY_STATUSES = new Set<ShareEntryStatus>([
  "pending",
  "saved",
  "failed",
  "unsupported",
]);
const ENTRY_KINDS = new Set<ShareEntryKind>([
  "link",
  "note",
  "image",
  "unsupported",
]);

export const SESSION_KEY = "incoming-share-session";

export const LAST_COMPLETED_SHARE_KEY = "last-completed-share";

export function fingerprintSharePayloads(
  rawPayloads: RawSharePayload[],
): string {
  if (!shareBatchAllowed(rawPayloads))
    throw new Error("Share batch is too large");
  const normalized = rawPayloads.map((p) => ({
    value: p.value,
    shareType: p.shareType,
    mimeType: p.mimeType ?? null,
  }));
  return JSON.stringify(normalized);
}

export function loadSession(store: SessionStoreAdapter): ShareSession | null {
  const raw = store.getString(SESSION_KEY);
  if (raw === undefined) return null;
  try {
    if (raw.length > MAX_SHARE_TEXT_BYTES * 2)
      throw new Error("Oversized share session");
    const parsed = JSON.parse(raw) as Partial<ShareSession>;
    if (
      typeof parsed.version !== "number" ||
      parsed.version !== SESSION_SCHEMA_VERSION ||
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.userId !== "string" ||
      parsed.userId.length === 0 ||
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.length === 0 ||
      (parsed.phase !== "active" && parsed.phase !== "complete") ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length === 0 ||
      parsed.entries.length > MAX_SHARE_ENTRIES ||
      !parsed.entries.every(isValidEntry)
    ) {
      store.remove(SESSION_KEY);
      return null;
    }
    return parsed as ShareSession;
  } catch {
    store.remove(SESSION_KEY);
    return null;
  }
}

function isValidEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.index === "number" &&
    Number.isInteger(e.index) &&
    e.index >= 0 &&
    typeof e.operationId === "string" &&
    e.operationId.length > 0 &&
    typeof e.kind === "string" &&
    ENTRY_KINDS.has(e.kind as ShareEntryKind) &&
    typeof e.status === "string" &&
    ENTRY_STATUSES.has(e.status as ShareEntryStatus)
  );
}

function saveSession(store: SessionStoreAdapter, session: ShareSession): void {
  store.set(SESSION_KEY, JSON.stringify(session));
}

export function operationIdFor(sessionId: string, index: number): string {
  return `share:${sessionId}:${index}`;
}

type ReconcileResult =
  | { kind: "empty" }
  | { kind: "new"; session: ShareSession }
  | { kind: "resume"; session: ShareSession }
  | { kind: "clear"; session: ShareSession }
  | { kind: "ghost" };

export function reconcileSession(
  store: SessionStoreAdapter,
  userId: string,
  rawPayloads: RawSharePayload[],
  generateSessionId: () => string,
): ReconcileResult {
  if (rawPayloads.length === 0) {
    deleteSession(store);
    return { kind: "empty" };
  }

  const currentFp = fingerprintSharePayloads(rawPayloads);
  const existing = loadSession(store);

  if (existing === null || existing.userId !== userId) {
    const settled = ghostRedelivery(store, currentFp, userId);
    if (
      settled !== null &&
      rawPayloads.every((_, i) => settled.some((e) => e.index === i))
    ) {
      return { kind: "ghost" };
    }
    return {
      kind: "new",
      session: startNewSession(
        store,
        userId,
        currentFp,
        rawPayloads,
        generateSessionId,
        settled ?? [],
      ),
    };
  }

  if (existing.fingerprint !== currentFp) {
    return {
      kind: "new",
      session: startNewSession(
        store,
        userId,
        currentFp,
        rawPayloads,
        generateSessionId,
      ),
    };
  }

  if (existing.phase === "complete") {
    return { kind: "clear", session: existing };
  }

  return { kind: "resume", session: existing };
}

export function startNewSession(
  store: SessionStoreAdapter,
  userId: string,
  fp: string,
  rawPayloads: RawSharePayload[],
  generateSessionId: () => string,
  settled: SettledEntry[] = [],
): ShareSession {
  if (!shareBatchAllowed(rawPayloads))
    throw new Error("Share batch is too large");
  const sessionId = generateSessionId();
  const byIndex = new Map(settled.map((e) => [e.index, e]));
  const session: ShareSession = {
    version: SESSION_SCHEMA_VERSION,
    fingerprint: fp,
    userId,
    sessionId,
    phase: "active",
    entries: rawPayloads.map((_, index): ShareEntry => {
      const done = byIndex.get(index);
      return {
        index,
        operationId: operationIdFor(sessionId, index),
        kind: done?.status === "unsupported" ? "unsupported" : "link",
        status: done?.status ?? "pending",
        ...(done?.itemId !== undefined ? { itemId: done.itemId } : {}),
      };
    }),
  };
  saveSession(store, session);
  return session;
}

export type SettledEntry = {
  index: number;
  status: "saved" | "unsupported";
  itemId?: string;
};

export function settledEntries(entries: ShareEntry[]): SettledEntry[] {
  const settled: SettledEntry[] = [];
  for (const e of entries) {
    if (e.status !== "saved" && e.status !== "unsupported") continue;
    settled.push({
      index: e.index,
      status: e.status,
      ...(e.itemId !== undefined ? { itemId: e.itemId } : {}),
    });
  }
  return settled;
}

export function recordCompletedShare(
  store: SessionStoreAdapter,
  fingerprint: string,
  userId: string,
  settled: SettledEntry[],
): void {
  store.set(
    LAST_COMPLETED_SHARE_KEY,
    JSON.stringify({ digest: digestFingerprint(fingerprint), userId, settled }),
  );
}

function digestFingerprint(fingerprint: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < fingerprint.length; i++) {
    const ch = fingerprint.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function ghostRedelivery(
  store: SessionStoreAdapter,
  fingerprint: string,
  userId: string,
): SettledEntry[] | null {
  const raw = store.getString(LAST_COMPLETED_SHARE_KEY);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as {
      digest?: unknown;
      userId?: unknown;
      settled?: unknown;
    };
    if (
      parsed.userId !== userId ||
      parsed.digest !== digestFingerprint(fingerprint)
    ) {
      return null;
    }
    if (!Array.isArray(parsed.settled) || !parsed.settled.every(isSettled)) {
      store.remove(LAST_COMPLETED_SHARE_KEY);
      return null;
    }
    return parsed.settled;
  } catch {
    store.remove(LAST_COMPLETED_SHARE_KEY);
    return null;
  }
}

export function forgetDeletedShareItem(
  store: SessionStoreAdapter,
  itemId: string,
): void {
  const raw = store.getString(LAST_COMPLETED_SHARE_KEY);
  if (raw === undefined) return;
  let parsed: { settled?: unknown };
  try {
    parsed = JSON.parse(raw) as { settled?: unknown };
  } catch {
    store.remove(LAST_COMPLETED_SHARE_KEY);
    return;
  }
  if (!Array.isArray(parsed.settled)) return;
  const settled = parsed.settled.filter(
    (e) => !(isSettled(e) && e.itemId === itemId),
  );
  if (settled.length === parsed.settled.length) return;
  store.set(LAST_COMPLETED_SHARE_KEY, JSON.stringify({ ...parsed, settled }));
}

function isSettled(value: unknown): value is SettledEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.index === "number" &&
    Number.isInteger(e.index) &&
    e.index >= 0 &&
    (e.status === "saved" || e.status === "unsupported") &&
    (e.itemId === undefined || typeof e.itemId === "string")
  );
}

export function updateEntry(
  store: SessionStoreAdapter,
  index: number,
  patch: Partial<ShareEntry>,
  sessionId?: string,
): void {
  const session = loadSession(store);
  if (session === null) return;
  if (sessionId !== undefined && session.sessionId !== sessionId) return;
  const entry = session.entries.find((e) => e.index === index);
  if (entry === undefined) return;
  Object.assign(entry, patch);
  saveSession(store, session);
}

export function markComplete(
  store: SessionStoreAdapter,
  sessionId?: string,
): void {
  const session = loadSession(store);
  if (session === null) return;
  if (sessionId !== undefined && session.sessionId !== sessionId) return;
  if (session.phase === "complete") return;
  session.phase = "complete";
  saveSession(store, session);
}

export function deleteSession(
  store: SessionStoreAdapter,
  sessionId?: string,
): void {
  if (sessionId !== undefined) {
    const session = loadSession(store);
    if (session !== null && session.sessionId !== sessionId) return;
  }
  store.remove(SESSION_KEY);
}

export function entriesToProcess(session: ShareSession): ShareEntry[] {
  return session.entries.filter(
    (e) => e.status === "pending" || e.status === "failed",
  );
}

// Persistent incoming-share session store. The share target can be killed at
// any point — mid-save, after backend success but before the native payload is
// cleared, or after the clear but before local state is deleted. This module
// records enough of the session to reconcile every one of those windows on the
// next launch, so a successful entry is never re-saved (duplicate) and a failed
// entry is never silently dropped.
//
// The contract the UI layer relies on, in plain terms:
//
//   1. fingerprintSharePayloads(rawPayloads) — a collision-free encoding of the
//      current raw shared payload batch (order + duplicates included). Two
//      distinct batches must never share a fingerprint, so a deliberate later
//      re-share of identical content is its own fresh session rather than
//      matching a stale completed one.
//   2. reconcileSession(userId, rawPayloads) — returns exactly one of:
//        { kind: 'new', session }     start a brand-new session for this batch
//        { kind: 'resume', session }  same batch + user as an active session: retry pending/failed
//        { kind: 'clear', session }   same batch + user as a COMPLETED session: clear native
//                                     payloads. NOTE: reconcileSession does NOT delete the record
//                                     here — a throwing clear must stay retryable on remount, so
//                                     the caller deletes it only after a non-throwing clear.
//        { kind: 'empty' }            no raw payloads: drop any stale local session
//        { kind: 'ghost' }            no session record, but the batch matches the last
//                                     completed one (see recordCompletedShare). Android keeps
//                                     the last share SEND intent in the task record and
//                                     re-delivers it to onCreate after a process death, so
//                                     reopening the app from recents replays the previous share
//                                     as if it were fresh. A fresh sessionId would mint a fresh
//                                     operationId and the backend ledger could not dedupe — the
//                                     last-saved item would be saved again. The caller skips it
//                                     quietly: the batch is already in Shelvr.
//      Sessions are scoped to userId: a record left by a different user (account
//      switch) is treated as no session, never matched.
//   3. updateEntry / markComplete / deleteSession — mutate the persisted session
//      in place. Each takes an optional sessionId scope so an in-flight run whose
//      record was replaced mid-flight cannot mutate the newer session.

/** A synchronous string-keyed bag, the slice of MMKV the session store needs.
 * Injecting it keeps this module unit-testable with a plain Map and lets a
 * future storage backend swap in without touching the reconciliation rules. */
export interface SessionStoreAdapter {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  contains(key: string): boolean;
}
/** One raw shared payload, as `useIncomingShare` exposes it. Only the fields
 * that contribute to identity are tracked, so the store has no compile-time
 * dependency on the (experimental, evolving) expo-sharing types. */
export type RawSharePayload = {
  value: string;
  shareType: string;
  mimeType?: string;
};

/** The kind of item a resolved entry will save as. `unsupported` covers audio,
 * video, file, and any future content type the share target deliberately does
 * not import — it is reported, never silently coerced into a note. */
export type ShareEntryKind = "link" | "note" | "image" | "unsupported";

export type ShareEntryStatus = "pending" | "saved" | "failed" | "unsupported";

/** A single resolved share entry plus its stable operation id and outcome. The
 * operation id is `share:<session>:<index>` — index is the entry's position in
 * the RAW payloads array, so it survives resolution reordering and is stable
 * across remounts/process-restart. */
export type ShareEntry = {
  index: number;
  operationId: string;
  kind: ShareEntryKind;
  status: ShareEntryStatus;
  /** The backend item id once an entry has saved successfully. */
  itemId?: string;
  /** A user-safe reason for a `failed`/`unsupported` outcome. */
  message?: string;
};

/** The persisted session shape. Bump `version` on any breaking change so a
 * stale incompatible record is dropped (via `loadSession`) rather than
 * misinterpreted. */
export type ShareSession = {
  version: number;
  fingerprint: string;
  /** The authenticated user (Convex Auth user id) this session belongs to. A record
   * left by a prior account must never be matched by a new user, even if the
   * share content is identical — otherwise switching accounts can silently drop
   * the new user's share by matching a stale completed session. loadSession and
   * reconcileSession treat a userId mismatch as "no session" (start fresh). */
  userId: string;
  sessionId: string;
  phase: "active" | "complete";
  entries: ShareEntry[];
};

export const SESSION_SCHEMA_VERSION = 1;

/** The status/kind enums, centralized so loadSession can validate every entry
 * against a closed set rather than trusting arbitrary persisted strings. */
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

/** Tombstone of the most recently completed (or cancelled) share batch, used
 * to detect Android task-restore ghost redeliveries. Survives completion —
 * unlike the session record, which is single-use by design. Scoped to the
 * authenticated user, like sessions: a prior account's tombstone must never
 * match a new user's identical share. */
export const LAST_COMPLETED_SHARE_KEY = "last-completed-share";

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/** A stable, unambiguous encoding of a raw payload batch. JSON of an array of
 * {value, shareType, mimeType} objects — never delimiter concatenation, which
 * can collide across distinct batches (e.g. `"a|b"` vs `"a","b"`). Order and
 * duplicates are preserved so two identical entries in one batch stay distinct
 * and a re-ordering reads as a different batch (a new session). */
export function fingerprintSharePayloads(
  rawPayloads: RawSharePayload[],
): string {
  // Sort object keys for determinism: an undefined mimeType serialized as
  // {mimeType: undefined} vs {mimeType omitted} must not flip the fingerprint.
  const normalized = rawPayloads.map((p) => ({
    value: p.value,
    shareType: p.shareType,
    mimeType: p.mimeType ?? null,
  }));
  return JSON.stringify(normalized);
}

// ---------------------------------------------------------------------------
// Session load / save / delete
// ---------------------------------------------------------------------------

/** Reads the persisted session, or null if absent or incompatible with the
 * current schema version. An incompatible (future/older) shape, a corrupt
 * record, OR any entry that fails structural validation is dropped: the caller
 * treats the next reconciliation as a fresh session rather than guessing at an
 * unknown layout. This is the only place a stale/corrupt record is sanitized,
 * so the rest of the module can trust the shape unconditionally. */
export function loadSession(store: SessionStoreAdapter): ShareSession | null {
  const raw = store.getString(SESSION_KEY);
  if (raw === undefined) return null;
  try {
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
      !parsed.entries.every(isValidEntry)
    ) {
      // Unknown/incompatible shape — drop it so a fresh session starts clean.
      store.remove(SESSION_KEY);
      return null;
    }
    return parsed as ShareSession;
  } catch {
    store.remove(SESSION_KEY);
    return null;
  }
}

/** Structural validator for one persisted entry. Requires an integer index, a
 * non-empty operationId, and a kind/status from the closed sets. A single bad
 * entry invalidates the whole record (we cannot tell which entries are trusted
 * if one is corrupt), so the caller drops it and starts a fresh session. */
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

/** Writes (or replaces) the persisted session. */
function saveSession(store: SessionStoreAdapter, session: ShareSession): void {
  store.set(SESSION_KEY, JSON.stringify(session));
}

// ---------------------------------------------------------------------------
// Entry helpers
// ---------------------------------------------------------------------------

/** Builds the stable operation id for an entry at `index` in the raw batch.
 * Index is the RAW position (not the resolved position) so it is stable across
 * resolution reordering and process restart. */
export function operationIdFor(sessionId: string, index: number): string {
  return `share:${sessionId}:${index}`;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

type ReconcileResult =
  | { kind: "empty" }
  | { kind: "new"; session: ShareSession }
  | { kind: "resume"; session: ShareSession }
  | { kind: "clear"; session: ShareSession }
  | { kind: "ghost" };

/** The single entry point the UI calls on every render/mount with the current
 * raw shared payloads. It decides — atomically with respect to the store —
 * whether this batch is brand-new, an active session to resume, a completed
 * session whose native payloads must be cleared, or empty.
 *
 * Sessions are scoped to the authenticated `userId`: a record left by a
 * different user (e.g. an account switch on a shared device) is treated as no
 * session and a fresh one starts, so a prior account's completed session can
 * never silently drop the new user's identical share.
 *
 * Completed-state is single-use: a fingerprint (and user) match alone is NOT a
 * durable "drop this share" signal. The caller clears native payloads and
 * deletes the record only after a non-throwing clear — reconcileSession itself
 * does NOT delete a completed record, so a throwing clear stays retryable on
 * remount. */
export function reconcileSession(
  store: SessionStoreAdapter,
  userId: string,
  rawPayloads: RawSharePayload[],
  generateSessionId: () => string,
): ReconcileResult {
  // No native payloads. Drop any stale local session — there is nothing to
  // resume or clear.
  if (rawPayloads.length === 0) {
    deleteSession(store);
    return { kind: "empty" };
  }

  const currentFp = fingerprintSharePayloads(rawPayloads);
  const existing = loadSession(store);

  // A session from a different user, or no session at all: normally start
  // fresh — but if this exact batch was just handled, it is (almost certainly)
  // an Android task-restore ghost, not a user action. A stale record from a
  // DIFFERENT batch stays a genuine 'new' (its own fingerprint mismatch path
  // below handles it).
  if (existing === null || existing.userId !== userId) {
    if (isGhostRedelivery(store, currentFp, userId)) {
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
      ),
    };
  }

  if (existing.fingerprint !== currentFp) {
    // Different batch: a new share superseded the previous one. Start fresh,
    // replacing the stale record. (The previous session's native payloads are
    // gone — a new share cannot arrive while old ones linger natively.)
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

  // Same batch as the persisted session.
  if (existing.phase === "complete") {
    // Direct the caller to clear the native payloads WITHOUT deleting the
    // record here: the caller's native clear may throw, and if it does the
    // completed session MUST stay so a remount reconciles and retries the
    // clear. The caller deletes the record only after a non-throwing clear
    // (single-use: once cleared, a later identical re-share starts a fresh
    // session instead of matching this stale completed record).
    return { kind: "clear", session: existing };
  }

  // Active session, same batch: resume only pending/failed entries. Saved
  // entries are kept as-is and NOT re-processed by the caller.
  return { kind: "resume", session: existing };
}

/** Allocates a brand-new active session for `rawPayloads` and persists it. All
 * entries start `pending`; the processor assigns their kind/status as it
 * resolves and saves them. */
export function startNewSession(
  store: SessionStoreAdapter,
  userId: string,
  fp: string,
  rawPayloads: RawSharePayload[],
  generateSessionId: () => string,
): ShareSession {
  const sessionId = generateSessionId();
  const session: ShareSession = {
    version: SESSION_SCHEMA_VERSION,
    fingerprint: fp,
    userId,
    sessionId,
    phase: "active",
    entries: rawPayloads.map((_, index) => ({
      index,
      operationId: operationIdFor(sessionId, index),
      kind: "link", // placeholder; the processor classifies each entry
      status: "pending",
    })),
  };
  saveSession(store, session);
  return session;
}

// ---------------------------------------------------------------------------
// Ghost-redelivery tombstone (Android task restore)
// ---------------------------------------------------------------------------

/** Records the batch that just finished its handoff (saved, continued, or
 * cancelled — any path through the share screen's completion). Replaces any
 * prior tombstone. Android only: iOS never replays a share. Takes the
 * completing user's id so a tombstone left by one account never matches
 * another account's identical batch (the ghost check is user-scoped). */
export function recordCompletedShare(
  store: SessionStoreAdapter,
  fingerprint: string,
  userId: string,
): void {
  store.set(
    LAST_COMPLETED_SHARE_KEY,
    JSON.stringify({ digest: digestFingerprint(fingerprint), userId }),
  );
}

/** A one-way digest of a fingerprint. The tombstone outlives the session, so
 * it keeps only this digest, never the shared URLs or note text themselves.
 * Sync because reconcileSession is sync (expo-crypto only hashes async).
 * ponytail: cyrb53, 53 bits, not cryptographic; a collision would skip a
 * genuinely new share, so move to SHA-256 only if the reconcile path goes
 * async. */
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

/** True when this fingerprint matches the user's last handled batch. */
function isGhostRedelivery(
  store: SessionStoreAdapter,
  fingerprint: string,
  userId: string,
): boolean {
  const raw = store.getString(LAST_COMPLETED_SHARE_KEY);
  if (raw === undefined) return false;
  try {
    const parsed = JSON.parse(raw) as { digest?: unknown; userId?: unknown };
    // A tombstone from a different account is not this user's ghost: their
    // identical share is a genuine new share.
    return (
      parsed.userId === userId &&
      parsed.digest === digestFingerprint(fingerprint)
    );
  } catch {
    store.remove(LAST_COMPLETED_SHARE_KEY);
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-place mutation of a persisted session
// ---------------------------------------------------------------------------

/** Updates one entry by index and persists the result. No-op (and no write) if
 * the session no longer exists OR if `sessionId` is provided and does not match
 * the current persisted session — the latter guards an in-flight save run from
 * mutating a NEWER session that replaced its record mid-flight (a new share
 * arriving while the old run is still saving). */
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

/** Marks the session complete and persists it. MUST be called BEFORE the native
 * clear so the after-clear-but-before-local-delete window reconciles correctly
 * (a matching completed session clears native payloads and deletes itself).
 *
 * `sessionId` scopes the completion to the originating session: an in-flight
 * run that finished after a newer session replaced its record must NOT mark the
 * newer session complete (which would clear the new share without saving it). */
export function markComplete(
  store: SessionStoreAdapter,
  sessionId?: string,
): void {
  const session = loadSession(store);
  if (session === null) return;
  if (sessionId !== undefined && session.sessionId !== sessionId) return;
  if (session.phase === "complete") return; // idempotent
  session.phase = "complete";
  saveSession(store, session);
}

/** Deletes the persisted session, but only if its id matches `sessionId` when
 * provided. Scoped so an in-flight run completing after a newer session arrived
 * cannot delete the newer session's record. */
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

/** The entries the processor should (re)attempt: those still pending or failed.
 * Saved and unsupported entries are excluded — successes are never re-saved. */
export function entriesToProcess(session: ShareSession): ShareEntry[] {
  return session.entries.filter(
    (e) => e.status === "pending" || e.status === "failed",
  );
}

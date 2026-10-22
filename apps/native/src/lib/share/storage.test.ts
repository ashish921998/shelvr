import { describe, expect, it } from "vitest";

import {
  deleteSession,
  entriesToProcess,
  fingerprintSharePayloads,
  forgetDeletedShareItem,
  LAST_COMPLETED_SHARE_KEY,
  loadSession,
  markComplete,
  operationIdFor,
  reconcileSession,
  recordCompletedShare,
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  startNewSession,
  updateEntry,
  type SessionStoreAdapter,
  type RawSharePayload,
} from "./storage";

function memoryStore(): SessionStoreAdapter {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
    contains: (k) => map.has(k),
  };
}

const USER = "user-a";
const OTHER_USER = "user-b";

const id = () => "sess-1";
const payload = (value: string, shareType = "text"): RawSharePayload => ({
  value,
  shareType,
});
const BATCH_A = [payload("https://a.example", "url")];
const BATCH_A_DUP = [payload("https://a.example", "url")];
const BATCH_B = [payload("https://b.example", "url")];

describe("fingerprintSharePayloads", () => {
  it("encodes order and duplicates so identical-content distinct batches stay distinct", () => {
    expect(fingerprintSharePayloads([payload("x"), payload("x")])).not.toBe(
      fingerprintSharePayloads([payload("x")]),
    );
    expect(fingerprintSharePayloads([payload("a"), payload("b")])).not.toBe(
      fingerprintSharePayloads([payload("b"), payload("a")]),
    );
    expect(fingerprintSharePayloads([payload("a"), payload("b")])).toBe(
      fingerprintSharePayloads([payload("a"), payload("b")]),
    );
  });

  it("includes mimeType and shareType so they distinguish otherwise-equal values", () => {
    expect(fingerprintSharePayloads([payload("x", "text")])).not.toBe(
      fingerprintSharePayloads([{ value: "x", shareType: "url" }]),
    );
    expect(fingerprintSharePayloads([payload("x")])).not.toBe(
      fingerprintSharePayloads([
        { value: "x", shareType: "text", mimeType: "text/plain" },
      ]),
    );
  });

  it("treats undefined and omitted mimeType identically (no flapping)", () => {
    expect(fingerprintSharePayloads([{ value: "x", shareType: "text" }])).toBe(
      fingerprintSharePayloads([
        { value: "x", shareType: "text", mimeType: undefined },
      ]),
    );
  });

  it("never collides via delimiter concatenation", () => {
    expect(fingerprintSharePayloads([payload("a|b")])).not.toBe(
      fingerprintSharePayloads([payload("a"), payload("b")]),
    );
  });
});

describe("operationIdFor", () => {
  it("embeds the session id and the raw index", () => {
    expect(operationIdFor("sess-1", 0)).toBe("share:sess-1:0");
    expect(operationIdFor("sess-1", 7)).toBe("share:sess-1:7");
  });
});

describe("reconcileSession", () => {
  it("starts a new active session for a fresh batch", () => {
    const store = memoryStore();
    const result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("new");
    if (result.kind !== "new") return;
    expect(result.session.phase).toBe("active");
    expect(result.session.sessionId).toBe("sess-1");
    expect(result.session.entries).toHaveLength(1);
    expect(result.session.entries[0].operationId).toBe("share:sess-1:0");
    expect(result.session.entries[0].status).toBe("pending");
    expect(loadSession(store)?.fingerprint).toBe(
      fingerprintSharePayloads(BATCH_A),
    );
  });

  it("resumes an active session with the same fingerprint (does not reset entries)", () => {
    const store = memoryStore();
    const first = reconcileSession(store, USER, BATCH_A, id);
    if (first.kind !== "new") throw new Error("expected new");
    updateEntry(store, 0, { status: "saved", itemId: "items-1", kind: "link" });

    const result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("resume");
    if (result.kind !== "resume") return;
    expect(result.session.entries[0].status).toBe("saved");
    expect(result.session.entries[0].itemId).toBe("items-1");
  });

  it("directs a clear for a matching completed session but KEEPS the record until clear succeeds", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, { status: "saved", itemId: "items-1", kind: "link" });
    markComplete(store);

    const result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("clear");
    expect(loadSession(store)).not.toBeNull();
    expect(loadSession(store)?.phase).toBe("complete");

    deleteSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it("starts a fresh session when a later re-share matches a stale completed record", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, { status: "saved", itemId: "items-1", kind: "link" });
    markComplete(store);
    reconcileSession(store, USER, BATCH_A, id);
    deleteSession(store);
    expect(loadSession(store)).toBeNull();

    const result = reconcileSession(store, USER, BATCH_A_DUP, id);
    expect(result.kind).toBe("new");
    if (result.kind !== "new") return;
    expect(result.session.entries[0].status).toBe("pending");
  });

  it("keeps directing a clear on repeated remounts until the caller deletes (throwing-clear safety)", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, { status: "saved", itemId: "items-1", kind: "link" });
    markComplete(store);

    let result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("clear");
    expect(loadSession(store)?.phase).toBe("complete");

    result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("clear");
    expect(loadSession(store)?.phase).toBe("complete");

    result = reconcileSession(store, USER, BATCH_A, id);
    expect(result.kind).toBe("clear");
    deleteSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it("starts a new session when the fingerprint differs", () => {
    const store = memoryStore();
    const first = reconcileSession(store, USER, BATCH_A, id);
    if (first.kind !== "new") throw new Error("expected new");
    const oldSessionId = first.session.sessionId;

    const result = reconcileSession(store, USER, BATCH_B, () => "sess-2");
    expect(result.kind).toBe("new");
    if (result.kind !== "new") return;
    expect(result.session.sessionId).not.toBe(oldSessionId);
  });

  it("drops stale local state when there are no raw payloads", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    expect(loadSession(store)).not.toBeNull();

    const result = reconcileSession(store, USER, [], id);
    expect(result.kind).toBe("empty");
    expect(loadSession(store)).toBeNull();
  });

  it("assigns distinct stable operation ids to duplicate entries in one batch", () => {
    const store = memoryStore();
    const result = reconcileSession(
      store,
      USER,
      [payload("x"), payload("x")],
      id,
    );
    if (result.kind !== "new") throw new Error("expected new");
    const ids = result.session.entries.map((e) => e.operationId);
    expect(ids).toEqual(["share:sess-1:0", "share:sess-1:1"]);
  });

  it("round-trips through the store with the current schema version", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    const session = loadSession(store);
    expect(session?.version).toBe(SESSION_SCHEMA_VERSION);
  });
});

describe("ghost redelivery (Android task-restore replay)", () => {
  function completedBatchA(store: SessionStoreAdapter) {
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, {
      status: "saved",
      itemId: "items-1",
      kind: "link",
    });
    markComplete(store, "sess-1");
    deleteSession(store, "sess-1");
    recordCompletedShare(store, fingerprintSharePayloads(BATCH_A), USER, [
      { index: 0, status: "saved", itemId: "items-1" },
    ]);
  }

  it("flags a record-less identical, fully settled batch as a ghost", () => {
    const store = memoryStore();
    completedBatchA(store);
    const result = reconcileSession(store, USER, BATCH_A, id);
    expect(result).toEqual({ kind: "ghost" });
    expect(loadSession(store)).toBeNull();
  });

  it("keeps no shared content in the tombstone, only a digest", () => {
    const store = memoryStore();
    completedBatchA(store);
    const tombstone = store.getString(LAST_COMPLETED_SHARE_KEY);
    expect(tombstone).toBeDefined();
    for (const p of BATCH_A) expect(tombstone).not.toContain(p.value);
  });

  it("treats a different batch as a genuine new share, not a ghost", () => {
    const store = memoryStore();
    completedBatchA(store);
    expect(reconcileSession(store, USER, BATCH_B, id).kind).toBe("new");
  });

  it("treats an identical batch as new when nothing completed before it", () => {
    const store = memoryStore();
    expect(reconcileSession(store, USER, BATCH_A, id).kind).toBe("new");
  });

  it("does not ghost-check an active or completed session match", () => {
    const store = memoryStore();
    completedBatchA(store);
    startNewSession(
      store,
      USER,
      fingerprintSharePayloads(BATCH_A),
      BATCH_A,
      id,
    );
    recordCompletedShare(store, fingerprintSharePayloads(BATCH_A), USER, []);
    expect(reconcileSession(store, USER, BATCH_A, id).kind).toBe("resume");
  });

  it("drops a corrupt tombstone instead of failing reconciliation", () => {
    const store = memoryStore();
    store.set(LAST_COMPLETED_SHARE_KEY, "not json{");
    expect(reconcileSession(store, USER, BATCH_A, id).kind).toBe("new");
  });

  it("never matches a tombstone left by a different user", () => {
    const store = memoryStore();
    completedBatchA(store);
    expect(reconcileSession(store, OTHER_USER, BATCH_A, id).kind).toBe("new");
  });

  it("retries a replayed batch that failed, instead of skipping it", () => {
    const store = memoryStore();
    recordCompletedShare(store, fingerprintSharePayloads(BATCH_A), USER, []);
    const result = reconcileSession(store, USER, BATCH_A, () => "sess-9");
    expect(result.kind).toBe("new");
    expect(loadSession(store)?.entries.map((e) => e.status)).toEqual(
      BATCH_A.map(() => "pending"),
    );
  });

  it("carries settled entries into a partly saved batch's replay", () => {
    const store = memoryStore();
    const batch = [...BATCH_A, ...BATCH_B];
    recordCompletedShare(store, fingerprintSharePayloads(batch), USER, [
      { index: 0, status: "saved", itemId: "items-1" },
    ]);
    const result = reconcileSession(store, USER, batch, () => "sess-9");
    expect(result.kind).toBe("new");
    const entries = loadSession(store)?.entries ?? [];
    expect(entries[0]).toMatchObject({ status: "saved", itemId: "items-1" });
    expect(entries.slice(1).every((e) => e.status === "pending")).toBe(true);
  });

  it("does not skip a replay when settled entries miss an index", () => {
    const store = memoryStore();
    const batch = [...BATCH_A, ...BATCH_B];
    recordCompletedShare(store, fingerprintSharePayloads(batch), USER, [
      { index: 0, status: "saved", itemId: "items-1" },
      { index: 0, status: "saved", itemId: "items-1" },
    ]);
    expect(reconcileSession(store, USER, batch, id).kind).toBe("new");
  });

  it("saves a replay whose tombstone predates settled entries", () => {
    const store = memoryStore();
    completedBatchA(store);
    const legacy = JSON.parse(store.getString(LAST_COMPLETED_SHARE_KEY)!) as {
      settled?: unknown;
    };
    delete legacy.settled;
    store.set(LAST_COMPLETED_SHARE_KEY, JSON.stringify(legacy));
    expect(reconcileSession(store, USER, BATCH_A, id).kind).toBe("new");
  });

  it("saves an identical re-share after its item was deleted", () => {
    const store = memoryStore();
    completedBatchA(store);
    forgetDeletedShareItem(store, "items-1");
    const result = reconcileSession(store, USER, BATCH_A, () => "sess-9");
    expect(result.kind).toBe("new");
    expect(loadSession(store)?.entries[0].status).toBe("pending");
  });

  it("keeps skipping the other saved entries after one item is deleted", () => {
    const store = memoryStore();
    const batch = [...BATCH_A, ...BATCH_B];
    recordCompletedShare(store, fingerprintSharePayloads(batch), USER, [
      { index: 0, status: "saved", itemId: "items-1" },
      { index: 1, status: "saved", itemId: "items-2" },
    ]);
    forgetDeletedShareItem(store, "items-2");
    reconcileSession(store, USER, batch, () => "sess-9");
    const entries = loadSession(store)?.entries ?? [];
    expect(entries[0]).toMatchObject({ status: "saved", itemId: "items-1" });
    expect(entries[1].status).toBe("pending");
  });

  it("still skips a replay when an unrelated item is deleted", () => {
    const store = memoryStore();
    completedBatchA(store);
    forgetDeletedShareItem(store, "items-other");
    expect(reconcileSession(store, USER, BATCH_A, id)).toEqual({
      kind: "ghost",
    });
  });

  it("starts a session with a fresh id via startNewSession", () => {
    const store = memoryStore();
    const session = startNewSession(
      store,
      USER,
      fingerprintSharePayloads(BATCH_A),
      BATCH_A,
      () => "sess-9",
    );
    expect(session.sessionId).toBe("sess-9");
    expect(session.phase).toBe("active");
    expect(session.entries[0].operationId).toBe("share:sess-9:0");
    expect(loadSession(store)?.sessionId).toBe("sess-9");
  });
});

describe("loadSession", () => {
  it("drops an incompatible (future) schema version rather than misinterpreting it", () => {
    const store = memoryStore();
    store.set(SESSION_KEY, JSON.stringify({ version: 999 }));
    expect(loadSession(store)).toBeNull();
    expect(store.contains(SESSION_KEY)).toBe(false);
  });

  it("drops unparseable JSON", () => {
    const store = memoryStore();
    store.set(SESSION_KEY, "{not json");
    expect(loadSession(store)).toBeNull();
  });

  it("drops a session missing required fields", () => {
    const store = memoryStore();
    store.set(SESSION_KEY, JSON.stringify({ version: 1 }));
    expect(loadSession(store)).toBeNull();
  });
});

describe("markComplete", () => {
  it("is idempotent", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    markComplete(store);
    markComplete(store);
    expect(loadSession(store)?.phase).toBe("complete");
  });

  it("is a no-op when no session exists", () => {
    const store = memoryStore();
    expect(() => markComplete(store)).not.toThrow();
    expect(loadSession(store)).toBeNull();
  });
});

describe("updateEntry", () => {
  it("applies a partial patch to the entry at the given index", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, {
      status: "failed",
      kind: "image",
      message: "upload down",
    });
    const entry = loadSession(store)?.entries[0];
    expect(entry?.status).toBe("failed");
    expect(entry?.kind).toBe("image");
    expect(entry?.message).toBe("upload down");
  });

  it("is a no-op when the session or index is absent", () => {
    const store = memoryStore();
    expect(() => updateEntry(store, 0, { status: "saved" })).not.toThrow();
  });
});

describe("entriesToProcess", () => {
  it("selects only pending and failed entries", () => {
    const store = memoryStore();
    reconcileSession(
      store,
      USER,
      [payload("a"), payload("b"), payload("c")],
      id,
    );
    updateEntry(store, 0, { status: "saved" });
    updateEntry(store, 1, { status: "failed" });
    const session = loadSession(store)!;
    const toProcess = entriesToProcess(session);
    expect(toProcess.map((e) => e.index)).toEqual([1, 2]);
  });

  it("is empty once nothing is pending or failed", () => {
    const store = memoryStore();
    reconcileSession(store, USER, [payload("a"), payload("b")], id);
    expect(entriesToProcess(loadSession(store)!)).toHaveLength(2);
    updateEntry(store, 0, { status: "saved" });
    expect(entriesToProcess(loadSession(store)!)).toHaveLength(1);
    updateEntry(store, 1, { status: "unsupported" });
    expect(entriesToProcess(loadSession(store)!)).toHaveLength(0);
  });
});

describe("deleteSession", () => {
  it("removes the persisted record", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    deleteSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it("is a no-op against a different session id (scoped delete)", () => {
    const store = memoryStore();
    const first = reconcileSession(store, USER, BATCH_A, id);
    if (first.kind !== "new") throw new Error("expected new");
    const firstSessionId = first.session.sessionId;

    const second = reconcileSession(store, USER, BATCH_B, () => "sess-2");
    if (second.kind !== "new") throw new Error("expected new");

    deleteSession(store, firstSessionId);
    expect(loadSession(store)?.sessionId).toBe("sess-2");
  });
});

describe("user-scoped sessions (account switching)", () => {
  it("starts a fresh session when a different user reconciles an identical batch", () => {
    const store = memoryStore();
    const a = reconcileSession(store, USER, BATCH_A, id);
    if (a.kind !== "new") throw new Error("expected new");
    updateEntry(store, 0, { status: "saved", itemId: "items-a", kind: "link" });
    markComplete(store);

    const result = reconcileSession(
      store,
      "user-b",
      BATCH_A_DUP,
      () => "sess-b",
    );
    expect(result.kind).toBe("new");
    if (result.kind !== "new") return;
    expect(result.session.userId).toBe("user-b");
    expect(result.session.sessionId).toBe("sess-b");
  });

  it("does not match a different user's completed session (no silent drop)", () => {
    const store = memoryStore();
    reconcileSession(store, USER, BATCH_A, id);
    updateEntry(store, 0, { status: "saved", itemId: "items-a", kind: "link" });
    markComplete(store);

    const result = reconcileSession(store, "user-b", BATCH_A, () => "sess-b");
    expect(result.kind).not.toBe("clear");
    expect(result.kind).toBe("new");
    expect(loadSession(store)?.userId).toBe("user-b");
  });
});

describe("entry validation in loadSession", () => {
  it("drops a session containing a malformed entry ({}) instead of trusting it", () => {
    const store = memoryStore();
    store.set(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_SCHEMA_VERSION,
        fingerprint: "fp",
        userId: USER,
        sessionId: "sess-x",
        phase: "active",
        entries: [{}],
      }),
    );
    expect(loadSession(store)).toBeNull();
    expect(store.contains(SESSION_KEY)).toBe(false);
  });

  it("drops a session whose entry has an out-of-set status", () => {
    const store = memoryStore();
    store.set(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_SCHEMA_VERSION,
        fingerprint: "fp",
        userId: USER,
        sessionId: "sess-x",
        phase: "active",
        entries: [
          {
            index: 0,
            operationId: "share:sess-x:0",
            kind: "link",
            status: "bogus",
          },
        ],
      }),
    );
    expect(loadSession(store)).toBeNull();
  });

  it("drops a session whose entry has a kind outside ENTRY_KINDS", () => {
    const store = memoryStore();
    store.set(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_SCHEMA_VERSION,
        fingerprint: "fp",
        userId: USER,
        sessionId: "sess-x",
        phase: "active",
        entries: [
          {
            index: 0,
            operationId: "share:sess-x:0",
            kind: "garbage",
            status: "pending",
          },
        ],
      }),
    );
    expect(loadSession(store)).toBeNull();
  });

  it("drops a session whose entry has a non-integer index", () => {
    const store = memoryStore();
    store.set(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_SCHEMA_VERSION,
        fingerprint: "fp",
        userId: USER,
        sessionId: "sess-x",
        phase: "active",
        entries: [
          {
            index: 1.5,
            operationId: "share:sess-x:0",
            kind: "link",
            status: "pending",
          },
        ],
      }),
    );
    expect(loadSession(store)).toBeNull();
  });

  it("drops a session whose entry has an empty operationId", () => {
    const store = memoryStore();
    store.set(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_SCHEMA_VERSION,
        fingerprint: "fp",
        userId: USER,
        sessionId: "sess-x",
        phase: "active",
        entries: [
          { index: 0, operationId: "", kind: "link", status: "pending" },
        ],
      }),
    );
    expect(loadSession(store)).toBeNull();
  });
});

describe("session-scoped mutations (new-share-during-in-flight-run safety)", () => {
  it("updateEntry is a no-op when sessionId does not match", () => {
    const store = memoryStore();
    const first = reconcileSession(store, USER, BATCH_A, id);
    if (first.kind !== "new") throw new Error("expected new");
    const firstSessionId = first.session.sessionId;

    reconcileSession(store, USER, BATCH_B, () => "sess-2");

    updateEntry(store, 0, { status: "saved", kind: "link" }, firstSessionId);
    const live = loadSession(store);
    expect(live?.sessionId).toBe("sess-2");
    expect(live?.entries[0].status).toBe("pending");
  });

  it("markComplete is a no-op when sessionId does not match", () => {
    const store = memoryStore();
    const first = reconcileSession(store, USER, BATCH_A, id);
    if (first.kind !== "new") throw new Error("expected new");
    const firstSessionId = first.session.sessionId;

    reconcileSession(store, USER, BATCH_B, () => "sess-2");
    markComplete(store, firstSessionId);
    expect(loadSession(store)?.phase).toBe("active");
  });
});

it("rejects oversized raw share batches before writing a session", async () => {
  const { shareBatchAllowed, MAX_SHARE_ENTRIES, MAX_SHARE_TEXT_BYTES } =
    await import("./storage");
  expect(
    shareBatchAllowed(
      Array.from({ length: MAX_SHARE_ENTRIES + 1 }, () => ({
        value: "x",
        shareType: "text",
      })),
    ),
  ).toBe(false);
  expect(
    shareBatchAllowed([
      { value: "é".repeat(MAX_SHARE_TEXT_BYTES), shareType: "text" },
    ]),
  ).toBe(false);
  expect(shareBatchAllowed([{ value: "valid", shareType: "text" }])).toBe(true);
});

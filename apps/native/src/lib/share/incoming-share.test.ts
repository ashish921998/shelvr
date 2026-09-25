import { describe, expect, it } from "vitest";

import {
  initialIncomingShare,
  stepIncomingShare,
  type IncomingShareState,
  type ShareContext,
  type ShareEffect,
  type ShareEvent,
} from "./incoming-share";
import {
  fingerprintSharePayloads,
  operationIdFor,
  type RawSharePayload,
  type ShareEntry,
  type ShareSession,
} from "./storage";

const raw: RawSharePayload[] = [
  { value: "https://example.com/a", shareType: "url", mimeType: "text/plain" },
];

const ctx = (over: Partial<ShareContext> = {}): ShareContext => ({
  userId: "user-1",
  entitled: true,
  entitlementLoading: false,
  rawPayloads: raw,
  resolved: [
    {
      contentType: "website",
      value: raw[0].value,
      contentUri: null,
      contentMimeType: "text/plain",
    },
  ],
  ...over,
});

const session = (
  sessionId: string,
  status: ShareEntry["status"] = "pending",
): ShareSession => ({
  version: 1,
  fingerprint: fingerprintSharePayloads(raw),
  userId: "user-1",
  sessionId,
  phase: "active",
  entries: [
    {
      index: 0,
      operationId: operationIdFor(sessionId, 0),
      kind: "link",
      status,
    },
  ],
});

/** Runs events in order, collecting every effect. */
function run(
  events: ShareEvent[],
  context: ShareContext = ctx(),
  from: IncomingShareState = initialIncomingShare(true),
) {
  let state = from;
  const effects: ShareEffect[][] = [];
  for (const event of events) {
    const next = stepIncomingShare(state, event, context);
    state = next.state;
    effects.push(next.effects);
  }
  return { state, effects };
}

const types = (effects: ShareEffect[]) => effects.map((e) => e.type);

describe("incoming share owner", () => {
  it("starts one save when reconcile runs twice for the same session", () => {
    const s1 = session("s1");
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "new", session: s1 } },
      { type: "reconciled", result: { kind: "resume", session: s1 } },
    ]);
    expect(types(effects[0])).toEqual(["save"]);
    expect(effects[1]).toEqual([]);
    expect(state.phase.kind).toBe("saving");
    expect(state.running).toBe("s1");
  });

  it("does not restart a session settled on the partial screen until Retry", () => {
    const s1 = session("s1");
    const failed = session("s1", "failed");
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "new", session: s1 } },
      { type: "saveSettled", session: failed },
      { type: "reconciled", result: { kind: "resume", session: failed } },
      { type: "retry", live: failed },
    ]);
    expect(effects[1]).toEqual([]);
    expect(effects[2]).toEqual([]);
    expect(types(effects[3])).toEqual(["save"]);
    expect(state.partial).toBeNull();
  });

  it("completes a stale session scoped to its own id, without a tombstone", () => {
    // s1 is saving when a newer share replaces the record with s2.
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "new", session: session("s1") } },
      { type: "reconciled", result: { kind: "new", session: session("s2") } },
      {
        type: "entrySettled",
        sessionId: "s1",
        entry: session("s1", "saved").entries[0],
      },
      { type: "saveSettled", session: session("s1", "saved") },
      { type: "saveSettled", session: session("s2", "saved") },
    ]);
    expect(types(effects[1])).toEqual(["save"]);
    // s1's progress is persisted against s1 only and never drawn over s2.
    expect(effects[2]).toEqual([
      {
        type: "persistEntry",
        sessionId: "s1",
        entry: session("s1", "saved").entries[0],
      },
    ]);
    expect(effects[3]).toEqual([
      { type: "markComplete", sessionId: "s1" },
      {
        type: "nativeClear",
        for: { kind: "complete", session: session("s1", "saved") },
      },
    ]);
    // s2 still owns the record, so its completion tombstones the batch.
    expect(types(effects[4])).toEqual([
      "markComplete",
      "tombstone",
      "nativeClear",
    ]);
    expect(state.running).toBeNull();
  });

  it("orders a completion around the native clear outcome", () => {
    const saved = session("s1", "saved");
    const clear = { kind: "complete" as const, session: saved };
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "new", session: session("s1") } },
      { type: "saveSettled", session: saved },
      { type: "complete", session: saved },
      { type: "nativeClearSettled", ok: false, for: clear },
      { type: "complete", session: saved },
      { type: "nativeClearSettled", ok: true, for: clear },
    ]);
    // A second press while completing is a no-op.
    expect(effects[2]).toEqual([]);
    // A throwing clear keeps the session and offers Try again.
    expect(effects[3]).toEqual([]);
    expect(types(effects[4])).toEqual([
      "markComplete",
      "tombstone",
      "nativeClear",
    ]);
    expect(effects[5]).toEqual([
      { type: "clearDiscardRecord" },
      { type: "deleteSession", sessionId: "s1" },
      { type: "clearPendingFlag" },
      { type: "recordFirstShare", userId: "user-1" },
      { type: "sharedContentSaved", itemCount: 1 },
      { type: "navigateHome" },
    ]);
    expect(state.phase.kind).toBe("complete");
  });

  it("never tombstones on iOS", () => {
    const { effects } = run(
      [
        { type: "reconciled", result: { kind: "new", session: session("s1") } },
        { type: "saveSettled", session: session("s1", "saved") },
      ],
      ctx(),
      initialIncomingShare(false),
    );
    expect(types(effects[1])).toEqual(["markComplete", "nativeClear"]);
  });

  it("records the discard when Cancel's native clear throws", () => {
    const fingerprint = fingerprintSharePayloads(raw);
    const { effects } = run([
      { type: "cancel" },
      {
        type: "nativeClearSettled",
        ok: false,
        for: { kind: "abandon", fingerprint },
      },
    ]);
    expect(effects[0]).toEqual([
      { type: "deleteSession" },
      { type: "clearPendingFlag" },
      { type: "nativeClear", for: { kind: "abandon", fingerprint } },
    ]);
    expect(effects[1]).toEqual([
      { type: "markDiscarded", fingerprint },
      { type: "navigateHome" },
    ]);
  });

  it("logs the ghost prompt once and ignores Save again after Cancel", () => {
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "ghost" } },
      { type: "reconciled", result: { kind: "ghost" } },
      { type: "ghostDismiss" },
      { type: "ghostSaveAgain" },
      { type: "ghostDismiss" },
    ]);
    expect(effects[0]).toEqual([
      { type: "capture", event: "share_ghost_prompt" },
    ]);
    expect(effects[1]).toEqual([]);
    expect(types(effects[2])).toEqual([
      "capture",
      "deleteSession",
      "clearPendingFlag",
      "nativeClear",
    ]);
    expect(effects[3]).toEqual([]);
    expect(effects[4]).toEqual([]);
    expect(state.phase).toEqual({
      kind: "ghostConfirm",
      fingerprint: fingerprintSharePayloads(raw),
    });
  });

  it("starts exactly one session on Save again and ignores a queued Cancel", () => {
    const s1 = session("s1");
    const { state, effects } = run([
      { type: "reconciled", result: { kind: "ghost" } },
      { type: "ghostSaveAgain" },
      { type: "ghostSaveAgain" },
      { type: "ghostDismiss" },
      { type: "sessionStarted", session: s1 },
    ]);
    expect(effects[1]).toEqual([
      { type: "capture", event: "share_ghost_save_again" },
      {
        type: "startSession",
        userId: "user-1",
        fingerprint: fingerprintSharePayloads(raw),
        rawPayloads: raw,
      },
    ]);
    expect(effects[2]).toEqual([]);
    expect(effects[3]).toEqual([]);
    expect(types(effects[4])).toEqual(["save"]);
    expect(state.recordId).toBe("s1");
  });

  it("presents one paywall per locked session, then saves once entitled", () => {
    const s1 = session("s1");
    const locked = ctx({ entitled: false });
    let state = initialIncomingShare(true);
    const step = (event: ShareEvent, context: ShareContext) => {
      const next = stepIncomingShare(state, event, context);
      state = next.state;
      return next.effects;
    };
    expect(
      step(
        { type: "reconciled", result: { kind: "new", session: s1 } },
        locked,
      ),
    ).toEqual([{ type: "openPaywall" }]);
    expect(state.phase.kind).toBe("locked");
    expect(
      step(
        { type: "reconciled", result: { kind: "resume", session: s1 } },
        locked,
      ),
    ).toEqual([]);
    expect(
      step(
        { type: "reconciled", result: { kind: "resume", session: s1 } },
        ctx({ entitlementLoading: true }),
      ),
    ).toEqual([]);
    expect(
      types(
        step(
          { type: "reconciled", result: { kind: "resume", session: s1 } },
          ctx(),
        ),
      ),
    ).toEqual(["save"]);
    expect(state.locked).toBeNull();
    expect(state.phase.kind).toBe("saving");
  });

  it("classifies a fresh session and persists its terminal entries first", () => {
    const s1 = session("s1");
    const { effects } = run(
      [{ type: "reconciled", result: { kind: "new", session: s1 } }],
      ctx({
        resolved: [
          {
            contentType: "video",
            value: "clip",
            contentUri: "file://clip",
            contentMimeType: "video/mp4",
          },
        ],
      }),
    );
    const save = effects[0][0];
    expect(save.type).toBe("save");
    if (save.type !== "save") return;
    expect(save.input).toBe(s1);
    expect(save.classified.map((e) => e.status)).toEqual(["unsupported"]);
  });

  it("falls back to the run's own session when a crash leaves no record", () => {
    const s1 = session("s1");
    const { state } = run([
      { type: "reconciled", result: { kind: "new", session: s1 } },
      { type: "saveCrashed", session: s1, live: null },
    ]);
    expect(state.phase).toEqual({ kind: "partial", session: s1 });
    expect(state.running).toBeNull();
    expect(state.partial).toBe("s1");
  });
});

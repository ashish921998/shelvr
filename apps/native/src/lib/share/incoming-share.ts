import { classifyEntries, type ResolvedPayload } from "./process-share";
import { withEntry } from "./session-view";
import {
  fingerprintSharePayloads,
  settledEntries,
  type RawSharePayload,
  type reconcileSession,
  type SettledEntry,
  type ShareEntry,
  type ShareSession,
} from "./storage";

export type SharePhase =
  | { kind: "idle" }
  | { kind: "locked" }
  | { kind: "saving"; session: ShareSession }
  | { kind: "partial"; session: ShareSession }
  | { kind: "clearFailed"; session: ShareSession }
  | { kind: "complete" };

export type IncomingShareState = {
  phase: SharePhase;
  android: boolean;
  recordId: string | null;
  running: string | null;
  completing: string | null;
  partial: string | null;
  locked: string | null;
  ghostSkipped: boolean;
};

export type ShareContext = {
  userId: string | null;
  entitled: boolean;
  entitlementLoading: boolean;
  rawPayloads: RawSharePayload[];
  resolved: ResolvedPayload[];
  storedSessionId: string | null;
};

type ClearFor =
  | { kind: "complete"; session: ShareSession }
  | { kind: "abandon"; fingerprint: string };

export type ShareEvent =
  | { type: "reconciled"; result: ReturnType<typeof reconcileSession> }
  | { type: "entrySettled"; sessionId: string; entry: ShareEntry }
  | { type: "saveSettled"; session: ShareSession }
  | { type: "saveCrashed"; session: ShareSession; live: ShareSession | null }
  | { type: "nativeClearSettled"; ok: boolean; for: ClearFor }
  | { type: "complete"; session: ShareSession }
  | { type: "retry"; live: ShareSession | null }
  | { type: "cancel" }
  | { type: "unlock" };

export type ShareEffect =
  | { type: "markComplete"; sessionId: string }
  | {
      type: "tombstone";
      fingerprint: string;
      userId: string;
      settled: SettledEntry[];
    }
  | { type: "nativeClear"; for: ClearFor }
  | { type: "deleteSession"; sessionId?: string }
  | { type: "clearPendingFlag" }
  | { type: "clearDiscardRecord" }
  | { type: "markDiscarded"; fingerprint: string }
  | { type: "persistEntry"; sessionId: string; entry: ShareEntry }
  | {
      type: "save";
      input: ShareSession;
      session: ShareSession;
      classified: ShareEntry[];
      resolved: ResolvedPayload[];
    }
  | { type: "saveFailed"; session: ShareSession; error: unknown }
  | { type: "recordFirstShare"; userId: string }
  | { type: "capture"; event: "share_ghost_skipped" }
  | { type: "sharedContentSaved"; itemCount: number }
  | { type: "openPaywall" }
  | { type: "navigateHome" }
  | { type: "revealSpots"; itemId: string };

type Step = { state: IncomingShareState; effects: ShareEffect[] };

export function initialIncomingShare(android: boolean): IncomingShareState {
  return {
    phase: { kind: "idle" },
    android,
    recordId: null,
    running: null,
    completing: null,
    partial: null,
    locked: null,
    ghostSkipped: false,
  };
}

const none = (state: IncomingShareState): Step => ({ state, effects: [] });

export function stepIncomingShare(
  state: IncomingShareState,
  event: ShareEvent,
  ctx: ShareContext,
): Step {
  switch (event.type) {
    case "reconciled":
      return reconciled(state, event.result, ctx);
    case "entrySettled": {
      const { phase } = state;
      const next =
        phase.kind === "saving" && phase.session.sessionId === event.sessionId
          ? {
              ...state,
              phase: {
                kind: "saving" as const,
                session: withEntry(phase.session, event.entry),
              },
            }
          : state;
      return {
        state: next,
        effects: [
          {
            type: "persistEntry",
            sessionId: event.sessionId,
            entry: event.entry,
          },
        ],
      };
    }
    case "saveSettled": {
      const sid = event.session.sessionId;
      const settled = releaseRun(state, sid);
      const superseded =
        (state.recordId !== null && state.recordId !== sid) ||
        (ctx.storedSessionId !== null && ctx.storedSessionId !== sid);
      if (superseded) {
        return {
          state: settled,
          effects: [{ type: "markComplete", sessionId: sid }],
        };
      }
      if (event.session.entries.every((e) => e.status === "saved")) {
        return complete(settled, event.session, ctx);
      }
      return none({
        ...settled,
        partial: sid,
        phase: { kind: "partial", session: event.session },
      });
    }
    case "saveCrashed": {
      const sid = event.session.sessionId;
      return none({
        ...releaseRun(state, sid),
        partial: sid,
        phase: { kind: "partial", session: event.live ?? event.session },
      });
    }
    case "nativeClearSettled":
      return clearSettled(state, event.ok, event.for, ctx);
    case "complete":
      return complete(state, event.session, ctx);
    case "retry":
      return event.live === null
        ? none(state)
        : requestSave(state, event.live, ctx);
    case "cancel":
      return abandon(state, ctx);
    case "unlock":
      return { state, effects: [{ type: "openPaywall" }] };
  }
}

function reconciled(
  state: IncomingShareState,
  result: ReturnType<typeof reconcileSession>,
  ctx: ShareContext,
): Step {
  switch (result.kind) {
    case "empty":
      return none(state);
    case "ghost": {
      if (state.ghostSkipped) return none(state);
      const dropped = abandon(state, ctx);
      return {
        state: {
          ...dropped.state,
          ghostSkipped: true,
          phase: { kind: "complete" },
        },
        effects: [
          { type: "capture", event: "share_ghost_skipped" },
          ...dropped.effects,
        ],
      };
    }
    case "clear":
      return complete(
        { ...state, recordId: result.session.sessionId },
        result.session,
        ctx,
      );
    case "new":
    case "resume": {
      const session = result.session;
      const next = { ...state, recordId: session.sessionId };
      if (
        state.running === session.sessionId ||
        state.partial === session.sessionId
      ) {
        return none(next);
      }
      return requestSave(next, session, ctx);
    }
  }
}

function requestSave(
  state: IncomingShareState,
  session: ShareSession,
  ctx: ShareContext,
): Step {
  const sid = session.sessionId;
  if (state.running === sid) return none(state);
  if (ctx.entitlementLoading) return none(state);
  if (!ctx.entitled) {
    if (state.locked === sid) return none(state);
    return {
      state: { ...state, locked: sid, phase: { kind: "locked" } },
      effects: [{ type: "openPaywall" }],
    };
  }
  const fresh = session.entries.every((e) => e.status === "pending");
  let working = session;
  if (fresh) {
    try {
      working = { ...session, entries: classifyEntries(session, ctx.resolved) };
    } catch (error) {
      return {
        state: {
          ...state,
          partial: sid,
          locked: null,
          phase: { kind: "partial", session },
        },
        effects: [{ type: "saveFailed", session, error }],
      };
    }
  }
  return {
    state: {
      ...state,
      running: sid,
      partial: null,
      locked: null,
      phase: { kind: "saving", session: working },
    },
    effects: [
      {
        type: "save",
        input: session,
        session: working,
        classified: fresh
          ? working.entries.filter((e) => e.status !== "pending")
          : [],
        resolved: ctx.resolved,
      },
    ],
  };
}

function releaseRun(state: IncomingShareState, sid: string) {
  return state.running === sid ? { ...state, running: null } : state;
}

function complete(
  state: IncomingShareState,
  session: ShareSession,
  ctx: ShareContext,
): Step {
  const sid = session.sessionId;
  if (state.completing === sid) return none(state);
  const effects: ShareEffect[] = [{ type: "markComplete", sessionId: sid }];
  if (state.android && state.recordId === sid && ctx.storedSessionId === sid) {
    effects.push({
      type: "tombstone",
      fingerprint: session.fingerprint,
      userId: session.userId,
      settled: settledEntries(session.entries),
    });
  }
  effects.push({ type: "nativeClear", for: { kind: "complete", session } });
  return { state: { ...state, completing: sid }, effects };
}

/** One saved link opens the screen that drops its spots on the map; anything else goes Home. */
function afterSave(session: ShareSession): ShareEffect {
  const [only] = session.entries;
  return session.entries.length === 1 &&
    only.kind === "link" &&
    only.status === "saved" &&
    only.itemId !== undefined
    ? { type: "revealSpots", itemId: only.itemId }
    : { type: "navigateHome" };
}

function abandon(state: IncomingShareState, ctx: ShareContext): Step {
  return {
    state: { ...state, recordId: null },
    effects: [
      { type: "deleteSession" },
      { type: "clearPendingFlag" },
      {
        type: "nativeClear",
        for: {
          kind: "abandon",
          fingerprint: fingerprintSharePayloads(ctx.rawPayloads),
        },
      },
    ],
  };
}

function clearSettled(
  state: IncomingShareState,
  ok: boolean,
  cleared: ClearFor,
  ctx: ShareContext,
): Step {
  if (cleared.kind === "abandon") {
    return {
      state,
      effects: [
        ok
          ? { type: "clearDiscardRecord" }
          : { type: "markDiscarded", fingerprint: cleared.fingerprint },
        { type: "navigateHome" },
      ],
    };
  }
  const { session } = cleared;
  const sid = session.sessionId;
  if (!ok) {
    return none({
      ...state,
      completing: null,
      phase: { kind: "clearFailed", session },
    });
  }
  const effects: ShareEffect[] = [
    { type: "clearDiscardRecord" },
    { type: "deleteSession", sessionId: sid },
    { type: "clearPendingFlag" },
  ];
  if (
    ctx.userId !== null &&
    session.entries.some((e) => e.status === "saved")
  ) {
    effects.push({ type: "recordFirstShare", userId: ctx.userId });
  }
  if (session.entries.every((e) => e.status === "saved")) {
    effects.push({
      type: "sharedContentSaved",
      itemCount: session.entries.length,
    });
  }
  effects.push(afterSave(session));
  return {
    state: {
      ...state,
      recordId: state.recordId === sid ? null : state.recordId,
      phase: { kind: "complete" },
    },
    effects,
  };
}

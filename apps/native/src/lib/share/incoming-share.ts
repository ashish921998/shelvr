// The one owner of the incoming-share flow. The share screen feeds it events
// (a reconcile result, a settled save, a native clear outcome, a button
// press) and gets back the next state, including the phase it renders, and
// an ordered list of effects to run. Every rule the flow depends on lives
// here: effect ordering, which session is current, the per-session guards,
// the Android-only tombstone, the ghost-prompt latch, and the Pro gate.
//
// No React, Convex, storage, or native imports: the screen runs each effect
// against MMKV, SecureStore, expo-sharing, the router, and analytics, and
// reports the outcomes that decide what happens next (a native clear
// succeeding or throwing, a save settling) back as events.

import { classifyEntries, type ResolvedPayload } from "./process-share";
import { withEntry } from "./session-view";
import {
  fingerprintSharePayloads,
  type RawSharePayload,
  type reconcileSession,
  type ShareEntry,
  type ShareSession,
} from "./storage";

/** What the screen renders. The resolution-driven states (resolving, empty)
 * are derived in render from the share hook, never stored here.
 *
 * A terminal outcome with any failed/unsupported entry is `partial`, so the
 * user gets retry/continue/cancel; only an all-saved batch completes.
 * `clearFailed` is the escape hatch when the native clear throws: the
 * completed session is kept so a remount retries the clear, and the user gets
 * Try again / Cancel instead of an eternal spinner. `locked` is the Pro gate:
 * an unentitled user reaches the paywall, and a cancel lands on an explicit
 * Unlock Pro / Cancel screen rather than the "Saved to Shelvr" spinner. */
export type SharePhase =
  | { kind: "idle" }
  | { kind: "locked" }
  | { kind: "saving"; session: ShareSession }
  | { kind: "partial"; session: ShareSession }
  | { kind: "clearFailed"; session: ShareSession }
  | { kind: "ghostConfirm"; fingerprint: string }
  | { kind: "complete" };

export type IncomingShareState = {
  phase: SharePhase;
  android: boolean;
  /** The session id of the persisted record as this owner last wrote or
   * reconciled it. A newer share replaces the record; a run for the older
   * session is then stale and must not tombstone over the newer batch. */
  recordId: string | null;
  /** The session a save run is in flight for. A second run for the same
   * session never starts; a run for a newer session may. */
  running: string | null;
  /** Guards completion so it runs once per session, keyed so a later session
   * can still complete after an earlier one. */
  completing: string | null;
  /** The session settled on the partial screen. It must not auto-restart on
   * every reconcile; only Retry re-runs it. */
  partial: string | null;
  /** The session already routed to the paywall, so a reconcile re-run for it
   * does not present a second one. Cleared when a run starts, so a later
   * lapse gates the session again. */
  locked: string | null;
  /** The ghost prompt's first answer claims it: a queued second press can
   * neither start a second save nor save after Cancel, or the reverse. */
  ghostAnswered: boolean;
  /** One share_ghost_prompt per mount, however often reconcile re-runs. */
  ghostPromptLogged: boolean;
};

/** The world as the screen sees it when it dispatches. */
export type ShareContext = {
  userId: string | null;
  entitled: boolean;
  entitlementLoading: boolean;
  rawPayloads: RawSharePayload[];
  resolved: ResolvedPayload[];
  /** The session id the store holds right now. The owner's `recordId` only
   * catches up when a reconcile result is dispatched, a microtask after the
   * record is written, and another mount may have written it. */
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
  | { type: "sessionStarted"; session: ShareSession }
  | { type: "complete"; session: ShareSession }
  | { type: "retry"; live: ShareSession | null }
  | { type: "cancel" }
  | { type: "unlock" }
  | { type: "ghostDismiss" }
  | { type: "ghostSaveAgain" };

/** Effects run in order. `nativeClear` is always last in its list: its
 * outcome comes back as a `nativeClearSettled` event, which decides the rest.
 * `save` runs classified persists then the processor, reporting each settled
 * entry, the result, or a crash back as events. `startSession` writes the
 * session the ghost prompt approved and reports it as `sessionStarted` on the
 * next microtask, so the prompt stays up until the press has settled. */
export type ShareEffect =
  | { type: "markComplete"; sessionId: string }
  | { type: "tombstone"; fingerprint: string; userId: string }
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
  | {
      type: "startSession";
      userId: string;
      fingerprint: string;
      rawPayloads: RawSharePayload[];
    }
  | { type: "saveFailed"; session: ShareSession; error: unknown }
  | { type: "recordFirstShare"; userId: string }
  | {
      type: "capture";
      event:
        | "share_ghost_prompt"
        | "share_ghost_save_again"
        | "share_ghost_dismissed";
    }
  | { type: "sharedContentSaved"; itemCount: number }
  | { type: "openPaywall" }
  | { type: "navigateHome" };

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
    ghostAnswered: false,
    ghostPromptLogged: false,
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
      // Progress for a session no longer on screen is persisted (scoped to
      // its own record) but never drawn over the current phase.
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
      // A newer share replaced this session's record while it saved. Its
      // result must not clear the newer batch's native payloads, leave the
      // screen, or draw over the newer run; that session's own completion
      // does all of it. A missing record is not a replacement: a record lost
      // mid-save still completes, or the screen would spin forever.
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
      // The processor records per-entry save failures as data, so a crash is
      // persistence or classification. Show whatever survived in the store
      // on the partial screen: retry/continue/cancel, never a spinner.
      const sid = event.session.sessionId;
      return none({
        ...releaseRun(state, sid),
        partial: sid,
        phase: { kind: "partial", session: event.live ?? event.session },
      });
    }
    case "nativeClearSettled":
      return clearSettled(state, event.ok, event.for, ctx);
    case "sessionStarted":
      return requestSave(
        { ...state, recordId: event.session.sessionId },
        event.session,
        ctx,
      );
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
    case "ghostDismiss": {
      if (state.ghostAnswered) return none(state);
      const next = abandon({ ...state, ghostAnswered: true }, ctx);
      return {
        state: next.state,
        effects: [
          { type: "capture", event: "share_ghost_dismissed" },
          ...next.effects,
        ],
      };
    }
    case "ghostSaveAgain":
      // Start the session reconcileSession deliberately did not.
      if (
        state.phase.kind !== "ghostConfirm" ||
        ctx.userId === null ||
        state.ghostAnswered
      ) {
        return none(state);
      }
      return {
        state: { ...state, ghostAnswered: true },
        effects: [
          { type: "capture", event: "share_ghost_save_again" },
          {
            type: "startSession",
            userId: ctx.userId,
            fingerprint: state.phase.fingerprint,
            rawPayloads: ctx.rawPayloads,
          },
        ],
      };
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
      // No session record, but this exact batch was just handled: an Android
      // task-restore replayed the last share intent after a process death.
      // Saving it again would mint an operationId the backend ledger cannot
      // dedupe, and a deliberate identical re-share looks the same from JS,
      // so it always gets a confirmation, never a silent save or drop.
      const next: IncomingShareState = {
        ...state,
        recordId: null,
        ghostPromptLogged: true,
        phase: {
          kind: "ghostConfirm",
          fingerprint: fingerprintSharePayloads(ctx.rawPayloads),
        },
      };
      return {
        state: next,
        effects: state.ghostPromptLogged
          ? []
          : [{ type: "capture", event: "share_ghost_prompt" }],
      };
    }
    case "clear":
      // A completed session matches: clear native payloads and leave.
      return complete(
        { ...state, recordId: result.session.sessionId },
        result.session,
        ctx,
      );
    case "new":
    case "resume": {
      const session = result.session;
      const next = { ...state, recordId: session.sessionId };
      // Already running, or settled on the partial screen (only Retry re-runs
      // it). A different, newer session is unaffected by either guard.
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

/** The entitlement gate, then a save run for `session`. */
function requestSave(
  state: IncomingShareState,
  session: ShareSession,
  ctx: ShareContext,
): Step {
  const sid = session.sessionId;
  if (state.running === sid) return none(state);
  if (ctx.entitlementLoading) return none(state);
  // Saving is Pro. Set the locked phase before presenting, so a cancel lands
  // on the explicit Pro gate, and present once per session.
  if (!ctx.entitled) {
    if (state.locked === sid) return none(state);
    return {
      state: { ...state, locked: sid, phase: { kind: "locked" } },
      effects: [{ type: "openPaywall" }],
    };
  }
  // Classify a fresh session (no side effects), persisting terminal statuses
  // so a crash before any save still records failed/unsupported entries.
  const fresh = session.entries.every((e) => e.status === "pending");
  let working = session;
  if (fresh) {
    try {
      working = { ...session, entries: classifyEntries(session, ctx.resolved) };
    } catch (error) {
      // A malformed payload: settle on the partial screen as a crashed run
      // does (the screen reports it and reloads what survived), never idle
      // behind the "Saved to Shelvr" spinner.
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

/** Drops the run guard only if this run still holds it; a newer session may
 * have started since. */
function releaseRun(state: IncomingShareState, sid: string) {
  return state.running === sid ? { ...state, running: null } : state;
}

/** The one completion path for all-saved, Continue, Cancel on the partial
 * screen, and a reconciled completed session. Ordering is what the
 * crash-window reconciliation depends on:
 *   1. persist `phase: complete` (a crash after this reconciles as a clear)
 *   2. tombstone the batch, Android only, and only while this session still
 *      owns the record, so a stale run cannot overwrite a newer tombstone.
 *      Every later exit can delete the session, and without the tombstone
 *      the next task-restore replay would save the batch again. iOS never
 *      replays a share.
 *   3. native clear; the rest waits for its outcome (see clearSettled). */
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
    });
  }
  effects.push({ type: "nativeClear", for: { kind: "complete", session } });
  return { state: { ...state, completing: sid }, effects };
}

/** Explicit discard: drop the session and the pending flag, clear native
 * payloads, go Home. Deleting the session matters: leaving it would let a
 * later identical share resume the cancelled work. */
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
    // A throwing clear leaves the discarded batch in the native store, and
    // the resume path treats an unread batch as owed. Record it as discarded
    // so it is not routed back and re-saved under new operation ids. A clean
    // clear makes any discard record moot.
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
    // Keep the completed session so a remount (or Try again) retries.
    return none({
      ...state,
      completing: null,
      phase: { kind: "clearFailed", session },
    });
  }
  // The native store is empty: a discard record no longer describes
  // anything. Delete the session only now, or a later identical re-share
  // would match a stale completed record and be dropped. The pending flag
  // goes last so a process death mid-share still resumes next launch.
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
  effects.push({ type: "navigateHome" });
  return {
    state: {
      ...state,
      recordId: state.recordId === sid ? null : state.recordId,
      phase: { kind: "complete" },
    },
    effects,
  };
}

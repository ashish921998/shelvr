import { t, useAppLocale, localizeError } from "@/lib/i18n";
import { recordShareSaved } from "@/lib/first-share";
import {
  classifyEntries,
  processSession,
  type ResolvedPayload,
  type ShareSaveDeps,
} from "@/lib/share/process-share";
import {
  countPartial,
  countProgress,
  failedEntries,
  hasRetryableEntries,
  selectProcessorPayloads,
  withEntry,
} from "@/lib/share/session-view";
import {
  deleteSession,
  fingerprintSharePayloads,
  loadSession,
  markComplete,
  reconcileSession,
  recordCompletedShare,
  startNewSession,
  updateEntry,
  type RawSharePayload,
  type SessionStoreAdapter,
  type ShareEntry,
  type ShareSession,
} from "@/lib/share/storage";
import { clearPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { useSaveImages } from "@/lib/use-save-image";
import { analytics } from "@/lib/analytics";
import { openPaywall, useEntitlement } from "@/lib/entitlement";
import { useCurrentUser } from "@/lib/current-user";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { createMMKV } from "react-native-mmkv";
import Animated, { Keyframe, useReducedMotion } from "react-native-reanimated";
import { ThreadLoop } from "@/components/ink/ink-thread";
import { StitchLine } from "@/components/ink/stitch-line";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import {
  PrimaryButton,
  SecondaryButton,
  TertiaryAction,
} from "@/components/shelf/ink-button";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { Display, Headline } from "@/components/shelf/typography";
import { Wordmark } from "@/components/wordmark";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, REDUCED_FADE_IN, REDUCED_FADE_OUT } from "@/lib/motion";

/**
 * Landing screen for content shared into Shelvr from another app (Safari, Photos,
 * etc.). Resolves the incoming payload and saves each piece through the same
 * idempotent operation ledger the in-app flows use, with an explicit state
 * machine so partial failures stay visible and retryable across remounts and
 * process restarts.
 *
 * Completion ordering (the crash-window reconciliation depends on this exact
 * sequence, centralized in completeSession):
 *   1. persist `phase: complete`
 *   2. native clearSharedPayloads() — if it throws, the completed session stays
 *      so a remount retries the clear
 *   3. delete the local session record (only after a successful clear)
 *   4. navigate Home exactly once
 */

// Dedicated MMKV instance for the one share session record. The adapter
// interface lives in storage.ts so its reconciliation rules stay pure and
// unit-testable with a Map; only this native binding is owned here.
const shareStore: SessionStoreAdapter = createMMKV({ id: "incoming-share" });

const PHASE_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    easing: motion.easing.out,
  },
}).duration(motion.duration.enter);

const PHASE_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: -4 }],
    easing: motion.easing.out,
  },
}).duration(motion.duration.exit);

/** The session-driven UI states. The resolution-driven states (resolving,
 * empty) are pure functions of the `useIncomingShare` hook
 * props, so they are DERIVED during render rather than stored — storing them
 * would require synchronous setState in the effect (a cascading-render smell).
 * A terminal outcome with any failed/unsupported entry is reported as `partial`
 * so the user gets retry/continue/cancel — only an all-saved batch completes.
 *
 * `clearFailed` is the escape hatch for the throwing-native-clear window: the
 * completed session is retained (so a remount retries the clear) but the user
 * gets a manual "Try again" / "Cancel" rather than an eternal spinner.
 *
 * `locked` is the Pro-gate state. Saving is Pro-gated, so an unentitled user
 * sharing into Shelvr reaches the paywall instead of a save. If they purchase,
 * the entitlement flips and the save starts; if they cancel, this phase keeps
 * the screen on an explicit "Unlock Pro / Cancel" gate rather than falling
 * through to the terminal "Saved to Shelvr" spinner (which would otherwise
 * claim a save that never happened). */
type Phase =
  | { kind: "idle" }
  | { kind: "locked" }
  | { kind: "saving"; session: ShareSession }
  | { kind: "partial"; session: ShareSession }
  | { kind: "clearFailed"; session: ShareSession }
  | { kind: "ghostConfirm"; fingerprint: string }
  | { kind: "complete" };

export default function ShareScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: user } = useCurrentUser();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const {
    sharedPayloads,
    resolvedSharedPayloads,
    isResolving,
    error,
    clearSharedPayloads,
  } = useIncomingShare();
  const createLinkItem = useMutation(api.items.createLinkItem);
  const createNoteItem = useMutation(api.items.createNoteItem);
  const saveImages = useSaveImages();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // The session id currently being saved, set when a run starts and cleared when
  // it settles. A NEW share arriving mid-flight replaces the persisted record;
  // this id lets persistEntry/completeSession no-op against that newer session
  // and lets the effect detect+start the new run once the old one finishes.
  const runningSessionId = useRef<string | null>(null);
  // Guards navigation + clear so completion runs exactly once per session, keyed
  // by session id so a later session can still complete after an earlier one.
  const completingSessionId = useRef<string | null>(null);
  // The session currently shown on the partial screen. A settled-partial session
  // must NOT auto-restart on every re-render; only an explicit "Retry failed"
  // press re-runs it. A NEW session (different id) bypasses this and starts.
  const partialSessionId = useRef<string | null>(null);
  // The session already routed to the paywall. The locked branch returns before
  // any await, so the running claim cannot cover it, and the effect re-runs for
  // the same session as soon as native resolution settles. Cleared when a run
  // starts so a later lapse gates the session again.
  const lockedSessionId = useRef<string | null>(null);
  // Synchronous latch shared by the ghost prompt's Save again and Cancel: the
  // first press claims the confirmation before any re-render, so a queued
  // second press can neither start a second save (each press mints a NEW
  // session id runSave cannot dedupe) nor save after Cancel, or vice versa.
  // ghostConfirm never returns within this mount afterwards.
  const ghostAnswered = useRef(false);
  // The reconcile effect re-runs on dependency identity changes; count one
  // share_ghost_prompt per mount, not per re-run.
  const ghostPromptLogged = useRef(false);

  /** The injected save operations, built once. Both the initial run and a
   * "Retry failed" press share this so the deps object is never rebuilt. */
  const saveDeps = useMemo<ShareSaveDeps>(
    () => ({
      saveLink: ({ url, operationId }) =>
        createLinkItem({
          url,
          operationId,
          analyticsSessionId: analytics.sessionId(),
          saveSource: "share_extension",
        }),
      saveNote: ({ text, operationId }) =>
        createNoteItem({
          text,
          operationId,
          analyticsSessionId: analytics.sessionId(),
          saveSource: "share_extension",
        }),
      saveImage: ({ image, operationId }) =>
        saveImages([{ image, operationId }], {
          saveSource: "share_extension",
        }).then((results) => results[0]),
    }),
    [createLinkItem, createNoteItem, saveImages],
  );

  /** The raw payload batch, narrowed to the identity-bearing fields the session
   * store and the processor's fallback read. Memoized because both the
   * processor payloads and the reconcile effect run against the same list. */
  const rawPayloads = useMemo<RawSharePayload[]>(
    () =>
      sharedPayloads.map((p) => ({
        value: p.value,
        shareType: p.shareType,
        mimeType: p.mimeType,
      })),
    [sharedPayloads],
  );

  /** The payload list the processor runs against (see selectProcessorPayloads
   * for the resolution-failure fallback). */
  const processorPayloads = useMemo<ResolvedPayload[]>(
    () =>
      selectProcessorPayloads({
        resolutionError: error,
        resolved: resolvedSharedPayloads,
        raw: rawPayloads,
      }),
    [error, rawPayloads, resolvedSharedPayloads],
  );

  /** The single idempotent completion path used by all-success, continue, AND
   * cancel. Cancel reuses it deliberately so the same persist-complete → native
   * clear → delete-session reconciliation applies unchanged.
   *
   * All three store mutations are scoped to `session.sessionId`: an in-flight
   * run finishing after a newer share replaced its record must NOT mark/delete
   * the newer session. A throwing native clear surfaces a `clearFailed` phase
   * (with Try again / Cancel) instead of an eternal spinner — the completed
   * session stays so a remount (or the manual retry) re-attempts the clear. */
  const completeSession = useCallback(
    (session: ShareSession) => {
      if (completingSessionId.current === session.sessionId) return;
      completingSessionId.current = session.sessionId;
      const sid = session.sessionId;
      // 1. Persist complete BEFORE the native clear. A crash between backend
      //    success and clear is then reconciled on remount (a matching
      //    completed session clears native payloads and deletes itself).
      markComplete(shareStore, sid);
      // 2. Tombstone the batch BEFORE the native clear: every later exit
      //    (clear, a throwing clear then Cancel, a crash) can delete the
      //    session, and without a tombstone the next Android task-restore
      //    replay would mint a fresh operationId the ledger cannot dedupe.
      //    User-scoped so one account's batch never matches another's.
      //    Android only — iOS never replays a share, so it never prompts.
      //    Skipped for a stale run whose record a newer share replaced, so it
      //    cannot overwrite the newer batch's tombstone.
      if (
        Platform.OS === "android" &&
        loadSession(shareStore)?.sessionId === sid
      ) {
        recordCompletedShare(shareStore, session.fingerprint, session.userId);
      }
      try {
        // 3. Native clear. A throwing clear keeps the completed session (no
        //    delete, no navigation) and surfaces clearFailed for a manual retry.
        clearSharedPayloads();
      } catch (err) {
        analytics.captureError("clear_shared_payloads_failed", err);
        completingSessionId.current = null;
        setPhase({ kind: "clearFailed", session });
        return;
      }
      // 4. Delete the local session ONLY after a successful clear — otherwise a
      //    later identical re-share would match a stale completed record and be
      //    silently dropped. Scoped so a stale in-flight run can't delete the
      //    newer session that replaced its record.
      deleteSession(shareStore, sid);
      // The share handoff is durable now — drop the deferred-share flag so the
      // resume hook can't re-open /share after we land Home. Kept this late so
      // a process death mid-share still resumes on next launch.
      try {
        clearPendingShareOnDevice();
      } catch (err) {
        // The share is already complete; a SecureStore failure must not trap
        // the user on this screen or prevent navigation home.
        analytics.captureError("clear_pending_share_failed", err);
      }
      if (user && session.entries.some((entry) => entry.status === "saved")) {
        try {
          recordShareSaved(user._id);
        } catch (err) {
          analytics.captureError("record_first_share_failed", err);
        }
      }
      // 5. Navigate Home exactly once.
      if (session.entries.every((entry) => entry.status === "saved")) {
        analytics.capture("shared_content_saved", {
          item_count: session.entries.length,
        });
      }
      setPhase({ kind: "complete" });
      router.replace("/");
    },
    [clearSharedPayloads, router, user],
  );

  /** Runs the processor for `session`, persisting each settled entry (scoped to
   * the session id) and advancing to the right terminal phase. Re-entrant guard
   * is keyed by session id: a second run for a DIFFERENT (newer) session is
   * allowed once the current one settles, but never two concurrent runs. */
  const runSave = useCallback(
    async (
      session: ShareSession,
      resolved: ResolvedPayload[],
      deps: ShareSaveDeps,
    ) => {
      // A run is already in flight for this session — don't start a second.
      if (runningSessionId.current === session.sessionId) return;
      if (entitlementLoading) return;
      // Saving is Pro — a lapsed user sharing into Shelvr is routed to the
      // paywall instead of failing every entry against the server gate. Set
      // the locked phase BEFORE presenting so a cancel lands on the explicit
      // Pro-gate screen, not the terminal "Saved to Shelvr" spinner.
      if (!entitled) {
        if (lockedSessionId.current === session.sessionId) return;
        lockedSessionId.current = session.sessionId;
        setPhase({ kind: "locked" });
        void openPaywall(router, "share");
        return;
      }
      runningSessionId.current = session.sessionId;
      // Starting (or retrying) a run clears the partial-settled marker for this
      // session so the effect won't block a future legitimate restart.
      partialSessionId.current = null;
      lockedSessionId.current = null;
      const sid = session.sessionId;

      try {
        // Classify entries (no side effects) if none have been processed yet,
        // persisting terminal statuses so a crash before any save still records
        // failed/unsupported entries on remount. Scoped to this session so a
        // newer session that replaced the record mid-flight is not corrupted.
        const fresh = session.entries.every((e) => e.status === "pending");
        let working = session;
        if (fresh) {
          const classified = classifyEntries(session, resolved);
          working = { ...session, entries: classified };
          for (const entry of classified) {
            if (entry.status !== "pending") {
              persistEntry(entry, sid);
            }
          }
        }

        setPhase({ kind: "saving", session: working });

        const result = await processSession(
          working,
          resolved,
          deps,
          (entry) => {
            persistEntry(entry, sid);
            // Reflect incremental progress: update the saving phase's session so
            // "Saved N of M" advances as each entry settles, not just at the end.
            setPhase((prev) =>
              prev.kind === "saving" && prev.session.sessionId === sid
                ? { kind: "saving", session: withEntry(prev.session, entry) }
                : prev,
            );
          },
        );

        const allSaved = result.entries.every((e) => e.status === "saved");
        if (allSaved) {
          completeSession(result);
        } else {
          // Some entries failed or were unsupported: stay and offer retry/continue.
          // Mark this session partial-settled so the effect won't auto-restart
          // it; only the Retry button re-runs it.
          partialSessionId.current = sid;
          setPhase({ kind: "partial", session: result });
        }
      } catch (err) {
        // processSession catches per-entry save failures as data, so an
        // unexpected throw here is from persistence/classification, not a save.
        // Reload whatever survived from the store and route to the partial phase
        // so the user gets retry/continue/cancel — never an eternal "Saving…"
        // spinner (the plan's "never spin forever" done criterion).
        analytics.captureError("share_save_failed", err);
        const live = loadSession(shareStore);
        partialSessionId.current = sid;
        setPhase({ kind: "partial", session: live ?? session });
      } finally {
        // Only clear the run guard if this run is still the active one — a newer
        // session may have started (the effect allows a new run once the old
        // settles), in which case leave the newer id in place.
        if (runningSessionId.current === sid) {
          runningSessionId.current = null;
        }
      }
    },
    [completeSession, entitled, entitlementLoading, router],
  );

  /** Clears native payloads (best-effort), drops any persisted session, and
   * returns Home. Used by the terminal error/empty states and the ghost
   * prompt's Cancel. Deleting the session is essential: a session may already
   * exist (e.g. counts diverged after the record was created), and leaving it
   * would let a later identical share resume the canceled work instead of
   * starting fresh. */
  const abandon = useCallback(() => {
    deleteSession(shareStore);
    // Explicit user discard — the deferred-share flag must not resurrect this.
    try {
      clearPendingShareOnDevice();
    } catch (err) {
      // Best-effort: abandoning the share must still clear native payloads and
      // leave the screen if SecureStore is temporarily unavailable.
      analytics.captureError("clear_pending_share_failed", err);
    }
    try {
      clearSharedPayloads();
    } catch {
      // best-effort; the share extension has nothing durable to lose here
    }
    router.replace("/");
  }, [clearSharedPayloads, router]);

  // Reconcile + drive the save. The resolution-driven phases (resolving /
  // empty) are derived in render below; this effect only runs once resolution
  // has settled AND there are payloads to save, so it contains no synchronous
  // setState for the derived states. A resolution failure no longer blocks the
  // save: processorPayloads falls back to the raw payloads.
  useEffect(() => {
    // No authenticated user yet (Convex Auth still loading): nothing to reconcile.
    if (user === null || user === undefined) return;
    // NOTE: the deferred-share flag is cleared in completeSession/abandon (the
    // durable handoff points), NOT here — a process death mid-share must still
    // resume the share on next launch.
    const userId = user._id;
    // Derived guards: while resolving, or with no payloads, render handles the
    // phase — nothing for the effect to do.
    if (isResolving || sharedPayloads.length === 0) {
      return;
    }

    const reconciled = reconcileSession(shareStore, userId, rawPayloads, () =>
      Crypto.randomUUID(),
    );

    if (reconciled.kind === "empty") {
      // No payloads resolved to anything saveable; render's empty branch covers it.
      return;
    }
    if (reconciled.kind === "ghost") {
      // No session record, but this exact batch was just handled — an Android
      // task-restore replayed the last share intent after a process death
      // (reopening from recents). Saving it again would mint a fresh
      // operationId the backend ledger cannot dedupe: the reported duplicate.
      // A deliberate identical re-share is indistinguishable from JS, so it
      // always gets a confirmation — never a silent drop.
      void Promise.resolve().then(() => {
        if (!ghostPromptLogged.current) {
          ghostPromptLogged.current = true;
          analytics.capture("share_ghost_prompt");
        }
        setPhase({
          kind: "ghostConfirm",
          fingerprint: fingerprintSharePayloads(rawPayloads),
        });
      });
      return;
    }
    if (reconciled.kind === "clear") {
      // A previously-completed session matches: clear native payloads and leave.
      // Deferred out of the synchronous effect body so completeSession's
      // setState does not trigger a cascading render.
      void Promise.resolve().then(() => completeSession(reconciled.session));
      return;
    }

    const session = reconciled.session;

    // A run is already in flight for THIS session: don't restart it (the user
    // may be mid-save, or the saving phase is already shown). A run for a
    // DIFFERENT session is allowed: runSave's guard only blocks the same id, and
    // the newer run replaces the persisted record (the older run's mutations are
    // session-scoped and no-op against the newer record).
    if (runningSessionId.current === session.sessionId) {
      return;
    }
    // A session already settled to the partial screen must not auto-restart on
    // every re-render — only the explicit "Retry failed" button re-runs it. A
    // new session (different id) is unaffected.
    if (partialSessionId.current === session.sessionId) {
      return;
    }

    // Fire and forget; runSave guards re-entrancy (per session id) and sets the
    // terminal phase. Deferred out of the synchronous effect body so runSave's
    // initial setPhase('saving') does not trip the cascading-render lint rule.
    void Promise.resolve().then(() =>
      runSave(session, processorPayloads, saveDeps),
    );
  }, [
    user,
    sharedPayloads,
    rawPayloads,
    processorPayloads,
    isResolving,
    saveDeps,
    runSave,
    completeSession,
  ]);

  // --- Derived resolution state (pure functions of hook props) --------------

  // Resolution failures no longer kill the share: the processor falls back to
  // the raw payloads (see processorPayloads) and entries the fallback cannot
  // resolve surface as failed entries on the partial screen.
  const nothingResolved =
    !isResolving && sharedPayloads.length === 0 && phase.kind === "idle";

  // --- Phase render ---------------------------------------------------------

  /** The Android task-restore ghost reached its confirmation: the redelivered
   * batch matches the last handled one. Cancel → clear and leave; Save again →
   * start the session reconcileSession deliberately did not. */
  const onGhostDismiss = useCallback(() => {
    if (ghostAnswered.current) return;
    ghostAnswered.current = true;
    analytics.capture("share_ghost_dismissed");
    abandon();
  }, [abandon]);

  const onGhostSaveAgain = useCallback(() => {
    if (
      phase.kind !== "ghostConfirm" ||
      user === null ||
      user === undefined ||
      ghostAnswered.current
    ) {
      return;
    }
    ghostAnswered.current = true;
    analytics.capture("share_ghost_save_again");
    const session = startNewSession(
      shareStore,
      user._id,
      phase.fingerprint,
      rawPayloads,
      () => Crypto.randomUUID(),
    );
    void Promise.resolve().then(() =>
      runSave(session, processorPayloads, saveDeps),
    );
  }, [phase, user, rawPayloads, processorPayloads, saveDeps, runSave]);

  // Entitlement is still loading — don't fall through to the idle/complete
  // render. The effect also blocks on entitlementLoading, so no save starts
  // until it resolves.
  if (entitlementLoading && phase.kind === "idle") {
    return (
      <Centered
        phaseKey="checking-entitlement"
        label={t("pro.checking")}
        thread
        theme={theme}
      />
    );
  }

  // Pro gate: an unentitled user sharing into Shelvr reached the paywall and
  // (on cancel) landed here. Do NOT fall through to the terminal "Saved to
  // Shelvr" spinner — the save never happened. Offer Unlock Pro or Cancel.
  if (phase.kind === "locked") {
    return (
      <PhaseSurface key="locked" phaseKey="locked">
        <Display style={styles.centreText}>{t("pro.unlockShelvr")}</Display>
        <Text style={styles.subtitle(theme)}>{t("share.proHelp")}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={t("pro.unlock")}
            onPress={() => {
              void openPaywall(router, "share");
            }}
          />
          <TertiaryAction
            label={t("common.cancel")}
            onPress={() => abandon()}
          />
        </View>
      </PhaseSurface>
    );
  }

  // Ghost confirmation: the redelivered batch matches the last handled one.
  // Never auto-save (that minted the duplicate), never silent-drop a genuine
  // re-share — one explicit question, then proceed either way.
  if (phase.kind === "ghostConfirm") {
    return (
      <PhaseSurface key="ghost-confirm" phaseKey="ghost-confirm">
        <Display style={styles.centreText}>{t("share.ghostTitle")}</Display>
        <Text style={styles.subtitle(theme)}>{t("share.ghostBody")}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={t("share.saveAgain")}
            onPress={onGhostSaveAgain}
          />
          <TertiaryAction label={t("common.cancel")} onPress={onGhostDismiss} />
        </View>
      </PhaseSurface>
    );
  }

  // Derived resolution states take precedence over the session-driven phases
  // stored in `phase`: they are pure functions of the hook props and avoid the
  // synchronous-in-effect setState that storing them would require.
  if (isResolving && phase.kind === "idle") {
    return (
      <Centered
        phaseKey="resolving"
        label={t("share.readingIt")}
        detail={t("share.reading")}
        thread
        theme={theme}
      />
    );
  }
  if (nothingResolved) {
    return (
      <ErrorActions
        phaseKey="nothing-resolved"
        title={t("share.empty")}
        retryLabel={t("common.done")}
        onRetry={abandon}
        single
      />
    );
  }
  if (phase.kind === "saving") {
    const { saved, total } = countProgress(phase.session, processorPayloads);
    return (
      <Centered
        phaseKey="saving"
        label={t("share.readingIt")}
        detail={t("share.progress", { saved, total })}
        thread
        theme={theme}
      />
    );
  }
  if (phase.kind === "partial") {
    const { saved, failed, total } = countPartial(
      phase.session,
      processorPayloads,
    );
    // Show Retry only when there is at least one failed/pending entry left to
    // attempt. Unsupported entries have nothing to retry.
    const hasRetryable = hasRetryableEntries(phase.session);
    // failed counts only failed/unsupported terminal entries; the orchestration-
    // error catch path can land here with still-pending entries (failed===0), so
    // word the subtitle from the count rather than assuming at least one failed.
    const failedWording =
      failed === 0
        ? t("share.pending")
        : t("share.failureCount", { count: failed });
    return (
      <PhaseSurface key="partial" phaseKey="partial">
        <Display style={styles.centreText}>
          {t("share.savedCount", { saved, total })}
        </Display>
        <Text style={styles.subtitle(theme)}>
          {failedWording} {t("share.retryHelp")}
        </Text>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          {failedEntries(phase.session, processorPayloads).map((e) => (
            <Text key={e.operationId} style={styles.failedItem(theme)}>
              {localizeError(e.message)}
            </Text>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          {hasRetryable ? (
            <PrimaryButton
              label={t("capture.retryFailed")}
              onPress={() => {
                const live = loadSession(shareStore);
                if (live === null) return;
                void runSave(live, processorPayloads, saveDeps);
              }}
            />
          ) : null}
          <SecondaryButton
            label={t("share.continueSaved")}
            onPress={() => completeSession(phase.session)}
          />
          <TertiaryAction
            label={t("common.cancel")}
            onPress={() => completeSession(phase.session)}
          />
        </View>
      </PhaseSurface>
    );
  }
  if (phase.kind === "clearFailed") {
    // Native clear threw: the completed session is retained so a remount (or the
    // Try again press) re-attempts it. This is the escape hatch so a persistently
    // throwing clear never traps the user on an eternal "Saving…" spinner.
    return (
      <ErrorActions
        phaseKey="clear-failed"
        title={t("share.finishFailed")}
        cancelLabel={t("common.cancel")}
        onCancel={abandon}
        retryLabel={t("common.tryAgain")}
        onRetry={() => completeSession(phase.session)}
      />
    );
  }
  // complete: the save has landed, so the stitch closes it — one word and a
  // full stop, the way every confirmation in the app reads.
  return (
    <Centered
      phaseKey="complete"
      label={t("spaces.shelved")}
      detail={t("share.success")}
      landed
      theme={theme}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Writes a single settled entry to the store, scoped to `sessionId`. The scope
 * makes the persist a no-op if a newer share has replaced this session's record
 * mid-flight, preventing cross-session corruption. Safe to call for any status. */
function persistEntry(entry: ShareEntry, sessionId: string): void {
  const patch: Partial<ShareEntry> = {
    status: entry.status,
    kind: entry.kind,
  };
  if (entry.itemId !== undefined) patch.itemId = entry.itemId;
  if (entry.message !== undefined) patch.message = entry.message;
  updateEntry(shareStore, entry.index, patch, sessionId);
}

// ---------------------------------------------------------------------------
// Presentational pieces
//
// This is the screen the design board calls the save landing: the wordmark
// over the ochre hairline, the thread running while Shelvr reads what you
// sent it, and a stitch closing the moment when it lands. Nothing spins here
// — a thread that keeps going is how the app says it is still working.
// ---------------------------------------------------------------------------

type Theme = ReturnType<typeof useUnistyles>["theme"];

/** The wordmark + hairline every phase of the landing wears. */
function LandingChrome() {
  return <ScreenHeader center={<Wordmark size={26} />} />;
}

/** Phase chrome with enter/exit transitions. The Reanimated drivers fire on
 * mount/unmount, so a phase change only animates if React remounts the
 * surface — callers must pass `key={phaseKey}` at each call site. */
function PhaseSurface({
  phaseKey,
  children,
}: {
  phaseKey: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reducedMotion ? REDUCED_FADE_IN : PHASE_ENTER}
      exiting={reducedMotion ? REDUCED_FADE_OUT : PHASE_EXIT}
      collapsable={false}
      style={styles.screen}
    >
      <LandingChrome />
      <View style={styles.container}>{children}</View>
    </Animated.View>
  );
}

/** The waiting and landed states: a headline in Exposure with the thread
 * looping above it, or — once it has landed — a stitch drawn underneath. */
function Centered({
  phaseKey,
  label,
  detail,
  thread,
  landed,
  theme,
}: {
  phaseKey: string;
  label: string;
  detail?: string;
  /** Still working: the ochre thread runs a loop that never closes. */
  thread?: boolean;
  /** It landed: stitches close the moment instead. */
  landed?: boolean;
  theme: Theme;
}) {
  return (
    <PhaseSurface key={phaseKey} phaseKey={phaseKey}>
      {thread ? (
        <View {...INK_A11Y}>
          <ThreadLoop width={200} height={120} />
        </View>
      ) : null}
      <Display style={styles.centreText}>{label}</Display>
      {detail ? <Text style={styles.label(theme)}>{detail}</Text> : null}
      {landed ? (
        <View style={styles.landedStitch} {...INK_A11Y}>
          <StitchLine width={140} />
        </View>
      ) : null}
    </PhaseSurface>
  );
}

function ErrorActions({
  phaseKey,
  title,
  cancelLabel,
  onCancel,
  retryLabel,
  onRetry,
  single,
}: {
  phaseKey: string;
  title: string;
  cancelLabel?: string;
  onCancel?: () => void;
  retryLabel: string;
  onRetry: () => void;
  single?: boolean;
}) {
  return (
    <PhaseSurface key={phaseKey} phaseKey={phaseKey}>
      <Headline style={styles.centreText}>{title}</Headline>
      <View style={styles.actions}>
        <PrimaryButton label={retryLabel} onPress={onRetry} />
        {single ||
        cancelLabel === undefined ||
        onCancel === undefined ? null : (
          <TertiaryAction label={cancelLabel} onPress={onCancel} />
        )}
      </View>
    </PhaseSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(3),
    // The header sits above this box, so measured centre reads low. Pulling
    // the content up by roughly the header's height puts it back on the
    // optical centre of the page.
    paddingBottom: theme.gap(6),
  },
  centreText: { textAlign: "center" },
  landedStitch: { marginTop: theme.gap(1) },
  label: (theme: Theme) => ({
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  }),
  subtitle: (theme: Theme) => ({
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: "center",
  }),
  list: {
    width: "100%",
    maxHeight: 200,
  },
  listContent: {
    gap: theme.gap(1),
    paddingVertical: theme.gap(2),
  },
  failedItem: (theme: Theme) => ({
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
    textAlign: "center",
  }),
  actions: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: theme.gap(1),
    marginTop: theme.gap(2),
  },
}));

import { t, useAppLocale, localizeError } from "@/lib/i18n";
import { recordShareSaved } from "@/lib/first-share";
import {
  initialIncomingShare,
  stepIncomingShare,
  type ShareEffect,
  type ShareEvent,
  type SharePhase,
} from "@/lib/share/incoming-share";
import {
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
} from "@/lib/share/session-view";
import {
  deleteSession,
  loadSession,
  markComplete,
  reconcileSession,
  recordCompletedShare,
  startNewSession,
  updateEntry,
  type RawSharePayload,
  type SessionStoreAdapter,
  type ShareEntry,
} from "@/lib/share/storage";
import {
  clearPendingShareOnDevice,
  clearShareDiscardedOnDevice,
  markShareDiscardedOnDevice,
} from "@/lib/share/pending-share-store";
import { useSaveImages } from "@/lib/use-save-image";
import { analytics } from "@/lib/analytics";
import { openPaywall, useCanSave } from "@/lib/entitlement";
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
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { createMMKV } from "react-native-mmkv";
import Animated, { Keyframe, useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  motion,
  motionCSS,
  REDUCED_FADE_IN,
  REDUCED_FADE_OUT,
} from "@/lib/motion";

/**
 * Landing screen for content shared into Shelvr from another app (Safari, Photos,
 * etc.). Resolves the incoming payload and saves each piece through the same
 * idempotent operation ledger the in-app flows use. Every decision (phases,
 * session guards, completion ordering, the tombstone, the ghost prompt, the
 * Pro gate) belongs to the owner in lib/share/incoming-share.ts; this screen
 * feeds it events, renders the phase it returns, and runs its effects.
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

export default function ShareScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: user } = useCurrentUser();
  // Pro, or a free save left. The owner calls it `entitled`: it only gates
  // whether this share may save.
  const { canSave: entitled, loading: entitlementLoading } = useCanSave();
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

  // The owner's state. Read and written synchronously on every dispatch, so
  // two presses landing before a re-render both see the first one's guards.
  const owner = useRef(initialIncomingShare(Platform.OS === "android"));
  const [phase, setPhase] = useState<SharePhase>(owner.current.phase);

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

  /** Steps the owner and runs the effects it returns, in order. A save that
   * settles later reports through the dispatch it started with, so the owner
   * sees the world as it was when it asked for the save. */
  const dispatch = useCallback(
    function dispatch(event: ShareEvent): void {
      const next = stepIncomingShare(owner.current, event, {
        userId: user?._id ?? null,
        entitled,
        entitlementLoading,
        rawPayloads,
        resolved: processorPayloads,
        storedSessionId: loadSession(shareStore)?.sessionId ?? null,
      });
      owner.current = next.state;
      for (const effect of next.effects) {
        runEffect(effect, dispatch, { clearSharedPayloads, router, saveDeps });
      }
      setPhase(owner.current.phase);
    },
    [
      user,
      entitled,
      entitlementLoading,
      rawPayloads,
      processorPayloads,
      clearSharedPayloads,
      router,
      saveDeps,
    ],
  );

  // Reconcile + drive the save. The resolution-driven phases (resolving /
  // empty) are derived in render below; this effect only runs once resolution
  // has settled AND there are payloads to save. A resolution failure does not
  // block the save: processorPayloads falls back to the raw payloads. The
  // deferred-share flag is cleared on completion or discard, NOT here, so a
  // process death mid-share still resumes on next launch.
  useEffect(() => {
    // No authenticated user yet (Convex Auth still loading): nothing to reconcile.
    if (user === null || user === undefined) return;
    if (isResolving || sharedPayloads.length === 0) return;
    const result = reconcileSession(shareStore, user._id, rawPayloads, () =>
      Crypto.randomUUID(),
    );
    // Deferred out of the synchronous effect body so the phase the owner
    // returns is not set during the effect (a cascading render).
    void Promise.resolve().then(() => dispatch({ type: "reconciled", result }));
  }, [user, sharedPayloads, rawPayloads, isResolving, dispatch]);

  // --- Derived resolution state (pure functions of hook props) --------------

  // Resolution failures no longer kill the share: the processor falls back to
  // the raw payloads (see processorPayloads) and entries the fallback cannot
  // resolve surface as failed entries on the partial screen.
  const nothingResolved =
    !isResolving && sharedPayloads.length === 0 && phase.kind === "idle";

  // --- Phase render ---------------------------------------------------------

  // Entitlement is still loading — don't fall through to the idle/complete
  // render. The effect also blocks on entitlementLoading, so no save starts
  // until it resolves.
  if (entitlementLoading && phase.kind === "idle") {
    return (
      <Centered
        phaseKey="checking-entitlement"
        label={t("pro.checking")}
        spinner
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
        <Text style={styles.title(theme)}>{t("pro.unlockShelvr")}</Text>
        <Text style={styles.subtitle(theme)}>{t("share.proHelp")}</Text>
        <View style={styles.actions}>
          <Button
            label={t("common.cancel")}
            theme={theme}
            onPress={() => dispatch({ type: "cancel" })}
          />
          <Button
            label={t("pro.unlock")}
            theme={theme}
            primary
            onPress={() => dispatch({ type: "unlock" })}
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
        <Text style={styles.title(theme)}>{t("share.ghostTitle")}</Text>
        <Text style={styles.subtitle(theme)}>{t("share.ghostBody")}</Text>
        <View style={styles.actions}>
          <Button
            label={t("common.cancel")}
            theme={theme}
            onPress={() => dispatch({ type: "ghostDismiss" })}
          />
          <Button
            label={t("share.saveAgain")}
            theme={theme}
            primary
            onPress={() => dispatch({ type: "ghostSaveAgain" })}
          />
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
        label={t("share.reading")}
        spinner
        theme={theme}
      />
    );
  }
  if (nothingResolved) {
    return (
      <ErrorActions
        phaseKey="nothing-resolved"
        title={t("share.empty")}
        theme={theme}
        retryLabel={t("common.done")}
        onRetry={() => dispatch({ type: "cancel" })}
        single
      />
    );
  }
  if (phase.kind === "saving") {
    const { saved, total } = countProgress(phase.session, processorPayloads);
    return (
      <Centered
        phaseKey="saving"
        label={t("share.progress", { saved, total })}
        spinner
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
        <Text style={styles.title(theme)}>
          {t("share.savedCount", { saved, total })}
        </Text>
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
          <Button
            label={t("common.cancel")}
            theme={theme}
            onPress={() =>
              dispatch({ type: "complete", session: phase.session })
            }
          />
          <Button
            label={t("share.continueSaved")}
            theme={theme}
            onPress={() =>
              dispatch({ type: "complete", session: phase.session })
            }
          />
          {hasRetryable ? (
            <Button
              label={t("capture.retryFailed")}
              theme={theme}
              primary
              onPress={() =>
                dispatch({ type: "retry", live: loadSession(shareStore) })
              }
            />
          ) : null}
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
        theme={theme}
        cancelLabel={t("common.cancel")}
        onCancel={() => dispatch({ type: "cancel" })}
        retryLabel={t("common.tryAgain")}
        onRetry={() => dispatch({ type: "complete", session: phase.session })}
      />
    );
  }
  // complete: brief spinner before navigation lands.
  return (
    <Centered
      phaseKey="complete"
      label={t("share.success")}
      spinner
      theme={theme}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EffectDeps = {
  clearSharedPayloads: () => void;
  router: ReturnType<typeof useRouter>;
  saveDeps: ShareSaveDeps;
};

/** Runs one owner effect. Best-effort effects report and carry on: the share
 * is already durable, or the screen is leaving, so a SecureStore failure must
 * not trap the user here. */
function runEffect(
  effect: ShareEffect,
  dispatch: (event: ShareEvent) => void,
  deps: EffectDeps,
): void {
  switch (effect.type) {
    case "markComplete":
      markComplete(shareStore, effect.sessionId);
      return;
    case "tombstone":
      recordCompletedShare(shareStore, effect.fingerprint, effect.userId);
      return;
    case "nativeClear": {
      let ok = true;
      try {
        deps.clearSharedPayloads();
      } catch (err) {
        analytics.captureError("clear_shared_payloads_failed", err);
        ok = false;
      }
      dispatch({ type: "nativeClearSettled", ok, for: effect.for });
      return;
    }
    case "deleteSession":
      deleteSession(shareStore, effect.sessionId);
      return;
    case "clearPendingFlag":
      bestEffort("clear_pending_share_failed", clearPendingShareOnDevice);
      return;
    case "clearDiscardRecord":
      bestEffort("clear_share_discarded_failed", clearShareDiscardedOnDevice);
      return;
    case "markDiscarded":
      bestEffort("mark_share_discarded_failed", () =>
        markShareDiscardedOnDevice(effect.fingerprint),
      );
      return;
    case "persistEntry":
      persistEntry(effect.entry, effect.sessionId);
      return;
    case "save":
      void save(effect, dispatch, deps.saveDeps);
      return;
    case "saveFailed":
      analytics.captureError("share_save_failed", effect.error);
      dispatch({
        type: "saveCrashed",
        session: effect.session,
        live: loadSession(shareStore),
      });
      return;
    case "startSession": {
      const session = startNewSession(
        shareStore,
        effect.userId,
        effect.fingerprint,
        effect.rawPayloads,
        () => Crypto.randomUUID(),
      );
      void Promise.resolve().then(() =>
        dispatch({ type: "sessionStarted", session }),
      );
      return;
    }
    case "recordFirstShare":
      bestEffort("record_first_share_failed", () =>
        recordShareSaved(effect.userId),
      );
      return;
    case "capture":
      analytics.capture(effect.event);
      return;
    case "sharedContentSaved":
      analytics.capture("shared_content_saved", {
        item_count: effect.itemCount,
      });
      return;
    case "openPaywall":
      void openPaywall(deps.router, "share");
      return;
    case "navigateHome":
      deps.router.replace("/");
      return;
  }
}

/** Persists the classified entries, runs the processor, and reports each
 * settled entry and the outcome back to the owner. */
async function save(
  effect: Extract<ShareEffect, { type: "save" }>,
  dispatch: (event: ShareEvent) => void,
  saveDeps: ShareSaveDeps,
): Promise<void> {
  const sid = effect.session.sessionId;
  try {
    for (const entry of effect.classified) persistEntry(entry, sid);
    const result = await processSession(
      effect.session,
      effect.resolved,
      saveDeps,
      (entry) => dispatch({ type: "entrySettled", sessionId: sid, entry }),
    );
    dispatch({ type: "saveSettled", session: result });
  } catch (err) {
    analytics.captureError("share_save_failed", err);
    dispatch({
      type: "saveCrashed",
      session: effect.input,
      live: loadSession(shareStore),
    });
  }
}

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

function bestEffort(code: string, run: () => void): void {
  try {
    run();
  } catch (err) {
    analytics.captureError(code, err);
  }
}

// ---------------------------------------------------------------------------
// Presentational pieces (existing theme typography/buttons — no design system)
// ---------------------------------------------------------------------------

type Theme = ReturnType<typeof useUnistyles>["theme"];

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
      style={styles.container}
    >
      {children}
    </Animated.View>
  );
}

function Centered({
  phaseKey,
  label,
  spinner,
  theme,
}: {
  phaseKey: string;
  label: string;
  spinner?: boolean;
  theme: Theme;
}) {
  return (
    <PhaseSurface key={phaseKey} phaseKey={phaseKey}>
      {spinner ? <ActivityIndicator color={theme.colors.primary} /> : null}
      <Text style={styles.label(theme)}>{label}</Text>
    </PhaseSurface>
  );
}

function ErrorActions({
  phaseKey,
  title,
  theme,
  cancelLabel,
  onCancel,
  retryLabel,
  onRetry,
  single,
}: {
  phaseKey: string;
  title: string;
  theme: Theme;
  cancelLabel?: string;
  onCancel?: () => void;
  retryLabel: string;
  onRetry: () => void;
  single?: boolean;
}) {
  return (
    <PhaseSurface key={phaseKey} phaseKey={phaseKey}>
      <Text style={styles.title(theme)}>{title}</Text>
      <View style={styles.actions}>
        {single ||
        cancelLabel === undefined ||
        onCancel === undefined ? null : (
          <Button label={cancelLabel} theme={theme} onPress={onCancel} />
        )}
        <Button label={retryLabel} theme={theme} primary onPress={onRetry} />
      </View>
    </PhaseSurface>
  );
}

function Button({
  label,
  theme,
  primary,
  onPress,
}: {
  label: string;
  theme: Theme;
  primary?: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  const scale = pressed ? (reducedMotion ? 0.99 : 0.97) : 1;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={[
          styles.button(theme),
          primary && styles.buttonPrimary(theme),
          {
            transform: [{ scale }],
            transitionProperty: "transform",
            transitionDuration: "120ms",
            transitionTimingFunction: motionCSS.out,
          },
        ]}
      >
        <Text
          style={[
            styles.buttonText(theme),
            primary && styles.buttonTextPrimary(theme),
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.gap(3),
  },
  label: (theme: Theme) => ({
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  }),
  title: (theme: Theme) => ({
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
    textAlign: "center",
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
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.gap(1.5),
    marginTop: theme.gap(2),
  },
  button: (theme: Theme) => ({
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  }),
  buttonPrimary: (theme: Theme) => ({
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  }),
  buttonText: (theme: Theme) => ({
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  }),
  buttonTextPrimary: (theme: Theme) => ({
    color: theme.colors.primaryForeground,
  }),
}));

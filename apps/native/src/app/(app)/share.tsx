import { shareBatchAllowed } from "@/lib/share/storage";
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
  updateEntry,
  type RawSharePayload,
  type ShareEntry,
} from "@/lib/share/storage";
import {
  clearPendingShareOnDevice,
  clearShareDiscardedOnDevice,
  markShareDiscardedOnDevice,
} from "@/lib/share/pending-share-store";
import { useSaveImages } from "@/lib/use-save-image";
import { analytics } from "@/lib/analytics";
import { saveFailureStage } from "@convex/model/saveErrors";
import { openPaywall, useEntitlement } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
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
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { shareStore } from "@/lib/share/share-store";
import Animated, { Keyframe, useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  motion,
  motionCSS,
  REDUCED_FADE_IN,
  REDUCED_FADE_OUT,
} from "@/lib/motion";
import { StitchRing } from "@/components/ui/stitch-loader";

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

function withSaveTelemetry<T>(
  saveKind: "link" | "note",
  operationId: string,
  run: () => Promise<T>,
): Promise<T> {
  analytics.capture("save_attempt_started", {
    save_source: "share_extension",
    save_kind: saveKind,
    operation_id: operationId,
  });
  return run().catch((error: unknown) => {
    analytics.capture("save_failed", {
      save_source: "share_extension",
      save_kind: saveKind,
      stage: saveFailureStage(error),
      operation_id: operationId,
    });
    throw error;
  });
}

export default function ShareScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: user } = useCurrentUser();
  const entitlement = useEntitlement();
  const { entitled } = entitlement;
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitled);
  const entitlementLoading = entitlement.loading || awaitingPurchase;
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

  const owner = useRef(initialIncomingShare(Platform.OS === "android"));
  const [phase, setPhase] = useState<SharePhase>(owner.current.phase);
  const [resolutionStarted, setResolutionStarted] = useState(false);

  const saveDeps = useMemo<ShareSaveDeps>(
    () => ({
      saveLink: ({ url, operationId }) =>
        withSaveTelemetry("link", operationId, () =>
          createLinkItem({
            url,
            operationId,
            analyticsSessionId: analytics.sessionId(),
            saveSource: "share_extension",
          }),
        ),
      saveNote: ({ text, operationId }) =>
        withSaveTelemetry("note", operationId, () =>
          createNoteItem({
            text,
            operationId,
            analyticsSessionId: analytics.sessionId(),
            saveSource: "share_extension",
          }),
        ),
      saveImage: ({ image, operationId }) =>
        saveImages([{ image, operationId }], {
          saveSource: "share_extension",
        }).then((results) => results[0]),
    }),
    [createLinkItem, createNoteItem, saveImages],
  );

  const rawPayloads = useMemo<RawSharePayload[]>(
    () =>
      (shareBatchAllowed(sharedPayloads) ? sharedPayloads : []).map((p) => ({
        value: p.value,
        shareType: p.shareType,
        mimeType: p.mimeType,
      })),
    [sharedPayloads],
  );

  const processorPayloads = useMemo<ResolvedPayload[]>(
    () =>
      selectProcessorPayloads({
        resolutionError: error,
        resolved: resolvedSharedPayloads,
        raw: rawPayloads,
      }),
    [error, rawPayloads, resolvedSharedPayloads],
  );

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

  useEffect(() => {
    if (!resolutionStarted) {
      setResolutionStarted(true);
      return;
    }
    if (user === null || user === undefined) return;
    if (isResolving || sharedPayloads.length === 0) return;
    const result = reconcileSession(shareStore, user._id, rawPayloads, () =>
      Crypto.randomUUID(),
    );
    void Promise.resolve().then(() => dispatch({ type: "reconciled", result }));
  }, [
    resolutionStarted,
    user,
    sharedPayloads,
    rawPayloads,
    isResolving,
    dispatch,
  ]);

  const nothingResolved =
    !isResolving && rawPayloads.length === 0 && phase.kind === "idle";

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
    const hasRetryable = hasRetryableEntries(phase.session);
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
  return (
    <Centered
      phaseKey="complete"
      label={t("share.success")}
      spinner
      theme={theme}
    />
  );
}

type EffectDeps = {
  clearSharedPayloads: () => void;
  router: ReturnType<typeof useRouter>;
  saveDeps: ShareSaveDeps;
};

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
      recordCompletedShare(
        shareStore,
        effect.fingerprint,
        effect.userId,
        effect.settled,
      );
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
      deps.router.replace("/(app)/(tabs)/(home)");
      return;
  }
}

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

type Theme = ReturnType<typeof useUnistyles>["theme"];

/** Phase chrome with enter/exit transitions. The Reanimated drivers fire on
 * mount/unmount, so a phase change only animates if React remounts the
 * surface: callers must pass `key={phaseKey}` at each call site. */
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
      {spinner ? <StitchRing size={22} /> : null}
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

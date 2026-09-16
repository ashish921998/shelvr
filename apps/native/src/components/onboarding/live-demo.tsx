import type { TextMessageKey } from "@/locales/message-types";
import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  DEMO_SAMPLES,
  demoDestination,
  type DemoKind,
  type DemoSample,
} from "@/lib/onboarding-demo";
import {
  clearLegacyDemoUrlIfSaved,
  resolveOnboardingSpaceName,
  setPendingDemo,
  type PendingDemo,
} from "@/lib/pending-onboarding";
import { firstSharedUrl } from "@/lib/share/process-share";
import { displayHost } from "@/lib/url";
import { useOAuthSignIn, type OAuthProvider } from "@/lib/oauth-sign-in";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { demoErrorCode, isRateLimitedError } from "@convex/model/demoErrors";
import { isTerminalFailure } from "@convex/model/itemFields";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Every path is real. The share button opens the system share sheet, the
// Shelvr extension hands the link back through expo-sharing, and the save runs
// through api.demo.createDemoItem (one per user, no Pro needed) and the actual
// pipeline. Before auth, the pending save is persisted so an app kill mid-OAuth
// resumes it. The record stays through reveal so a relaunch re-attaches to the
// same server item; finish() drops it.

const TIMEOUT_MS = 15_000;
const APP_ICON = require("../../../assets/icon.png");
const POST_IMAGES: Record<DemoKind, number> = {
  Articles: require("../../../assets/onboarding/demo-article.jpg"),
  Recipes: require("../../../assets/onboarding/demo-recipe.jpg"),
  Products: require("../../../assets/onboarding/demo-product.jpg"),
  Travel: require("../../../assets/onboarding/demo-travel.jpg"),
};

export type DemoSaved = { itemId: Id<"items">; savedSpaceNames: string[] };

type Phase = "share" | "paste" | "auth" | "reading" | "failed";

export function LiveDemoStep({
  sample,
  spaces,
  resume,
  onSaved,
  onReadingChange,
  onAdvance,
}: {
  sample: DemoSample;
  /** Stable preset identities kept in setup. */
  spaces: string[];
  /** A save captured before an earlier sign-in or relaunch. */
  resume: PendingDemo | null;
  onSaved: (saved: DemoSaved) => void;
  onReadingChange: (reading: boolean) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { isAuthenticated } = useConvexAuth();
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const retryDemoItem = useMutation(api.demo.retryDemoItem);

  const [phase, setPhase] = useState<Phase>(resume ? "auth" : "share");
  const [returnPhase, setReturnPhase] = useState<"share" | "paste">("share");
  const [authRequest, setAuthRequest] = useState<PendingDemo | null>(resume);
  const [draft, setDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [itemId, setItemId] = useState<Id<"items"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [error, setError] = useState<TextMessageKey | null>(null);
  const [demoUsed, setDemoUsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [deadlineNonce, setDeadlineNonce] = useState(0);
  const advancedRef = useRef(false);
  const shareSheetOpenRef = useRef(false);

  // 'skip', not `enabled`: a disabled React Query still subscribes through the
  // Convex adapter and sends `id: null`, which fails argument validation.
  const itemQuery = useQuery(
    convexQuery(api.items.getItem, itemId === null ? "skip" : { id: itemId }),
  );
  const item = itemQuery.data;

  useEffect(() => {
    onReadingChange(phase === "reading");
  }, [phase, onReadingChange]);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  }, [onAdvance]);

  useEffect(() => {
    if (!item || (phase !== "reading" && phase !== "failed")) return;
    if (item.status === "ready") {
      analytics.capture("onboarding_demo_result", { outcome: "ready" });
      advance();
    } else if (item.status === "failed" && phase !== "failed") {
      analytics.capture("onboarding_demo_result", { outcome: "failed" });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the server status
      setPhase("failed");
    } else if (item.status === "processing" && phase !== "reading") {
      setPhase("reading");
    }
  }, [item, phase, advance]);

  // A vanished save (deleted elsewhere, query error) is reported instead of
  // spinning forever.
  useEffect(() => {
    if (itemId === null || phase !== "reading") return;
    if (itemQuery.isError || (itemQuery.isSuccess && item === null)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surfaces a lost subscription
      setError(itemQuery.isError ? "demo.loadFailed" : "demo.saveGone");
      setItemId(null);
      setPhase(returnPhase);
    }
  }, [
    itemId,
    phase,
    item,
    itemQuery.isError,
    itemQuery.isSuccess,
    returnPhase,
  ]);

  // Only flips the slow flag. The user, never a timer, decides to move on.
  useEffect(() => {
    if (itemId === null || phase !== "reading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the deadline when the effect re-arms
    setTimedOut(false);
    const id = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [itemId, phase, deadlineNonce]);

  const submit = useCallback(
    async (rawUrl: string, destination: string | null) => {
      const url = rawUrl.trim();
      if (url === "" || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setError(null);
      setSavingUrl(url);
      const request = { url, destination };
      setPendingDemo(request);

      if (!isAuthenticated) {
        setAuthRequest(request);
        setPhase("auth");
        inFlightRef.current = false;
        setSubmitting(false);
        return;
      }

      analytics.capture("onboarding_demo_submitted");
      try {
        const result = await createDemoItem({
          url,
          spaceName: destination ?? undefined,
          analyticsSessionId: analytics.sessionId(),
        });
        setPendingDemo({
          url: result.url,
          destination: result.savedSpaceNames[0] ?? null,
        });
        clearLegacyDemoUrlIfSaved(result.url);
        setItemId(result.itemId);
        onSaved({
          itemId: result.itemId,
          savedSpaceNames: result.savedSpaceNames,
        });
        setPhase("reading");
      } catch (err) {
        // Structured ConvexError data, never `err.message`: production
        // redacts a plain server Error to "Server Error".
        const used = demoErrorCode(err) === "demo_used";
        analytics.capture("onboarding_demo_result", {
          outcome: used ? "already_used" : "error",
        });
        setDemoUsed(used);
        setError(used ? "demo.alreadyUsed" : "demo.saveFailed");
        setPhase((current) => (current === "auth" ? returnPhase : current));
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [createDemoItem, isAuthenticated, onSaved, returnPhase],
  );

  const submitUrl = useCallback(
    (url: string) => {
      const preset = demoDestination(url.trim(), spaces);
      void submit(
        url,
        preset === null ? null : resolveOnboardingSpaceName(preset),
      );
    },
    [spaces, submit],
  );

  // The share extension relaunches the app with an expo-sharing URL. The
  // payload is read directly: useIncomingShare caches its state and would not
  // refresh after a clear followed by a second share of the same link.
  const consumeShare = useCallback(() => {
    if (inFlightRef.current || advancedRef.current || shareSheetOpenRef.current)
      return;
    let url: string | null;
    try {
      url = firstSharedUrl(getSharedPayloads());
    } catch (err) {
      analytics.captureError("onboarding_share_read_failed", err);
      return;
    }
    if (url === null) return;
    clearSharedPayloads();
    setReturnPhase("share");
    submitUrl(url);
  }, [submitUrl]);

  const consumeShareRef = useRef(consumeShare);
  useEffect(() => {
    consumeShareRef.current = consumeShare;
  }, [consumeShare]);

  useEffect(() => {
    if (resume === null) consumeShareRef.current();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") consumeShareRef.current();
    });
    const links = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("expo-sharing")) consumeShareRef.current();
    });
    return () => {
      appState.remove();
      links.remove();
    };
  }, [resume]);

  // Resume the save once auth is ready. Server idempotency makes a repeat
  // submit return the same item.
  useEffect(() => {
    if (!isAuthenticated || authRequest === null) return;
    const request = authRequest;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the request once auth is ready
    setAuthRequest(null);
    void submit(request.url, request.destination);
  }, [isAuthenticated, authRequest, submit]);

  const openShareSheet = async () => {
    // The extension's relaunch URL arrives while the activity sheet is still
    // up, and the sign-in modal cannot present over it. Hold the payload
    // until Share.share resolves, after the sheet has dismissed.
    shareSheetOpenRef.current = true;
    try {
      await Share.share(
        Platform.OS === "ios" ? { url: sample.url } : { message: sample.url },
      );
    } catch (err) {
      analytics.captureError("onboarding_share_sheet_failed", err);
    } finally {
      shareSheetOpenRef.current = false;
    }
    consumeShare();
  };

  const cancelAuth = () => {
    setAuthRequest(null);
    setPendingDemo(null);
    setSavingUrl(null);
    setPhase(returnPhase);
  };

  const retry = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await retryDemoItem({});
      if (result.scheduled) setDeadlineNonce((nonce) => nonce + 1);
      setPhase("reading");
    } catch (err) {
      const code = demoErrorCode(err);
      setError(
        code === "terminal_failure"
          ? "demo.notFoundRetry"
          : code === "too_many_retries"
            ? "demo.repeatedFailure"
            : isRateLimitedError(err)
              ? "demo.tryLater"
              : "demo.retryFailed",
      );
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const paste = async () => {
    const clipped = await Clipboard.getStringAsync();
    if (clipped.trim() !== "") setDraft(clipped.trim());
  };

  const errorLine =
    error === null ? null : <Text style={styles.error}>{t(error)}</Text>;
  const continueAfterUsed = demoUsed ? (
    <GhostButton label={t("common.continue")} onPress={advance} />
  ) : null;

  if (phase === "reading" || phase === "failed") {
    const failed = phase === "failed";
    const terminal = failed && isTerminalFailure(item?.failureReason);
    const url = item?.url ?? savingUrl ?? "";
    return (
      <View style={styles.wrap}>
        <View style={styles.linkRow}>
          <View style={styles.linkThumb}>
            <AppSymbolIcon
              name="link"
              size={18}
              tintColor={theme.colors.muted}
            />
          </View>
          <View style={styles.linkText}>
            <Text style={styles.linkHost} numberOfLines={1}>
              {displayHost(url)}
            </Text>
            <Text style={styles.linkUrl} numberOfLines={1}>
              {url}
            </Text>
          </View>
          {failed ? null : (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          )}
        </View>

        {failed ? (
          <View style={styles.head}>
            <Text style={styles.headline}>{t("demo.linkSaved")}</Text>
            <Text style={styles.support}>
              {terminal ? t("demo.notFoundHelp") : t("demo.processingFailed")}
            </Text>
          </View>
        ) : (
          <View style={[styles.head, styles.centered]}>
            <Text style={[styles.headline, styles.center]}>
              {timedOut ? t("demo.slow") : t("demo.reading")}
            </Text>
            <ReadingSteps />
            <Text style={[styles.support, styles.center]}>
              {timedOut ? t("demo.eitherWay") : t("demo.keepsGoing")}
            </Text>
          </View>
        )}

        {errorLine}

        <View style={styles.foot}>
          {failed ? (
            <>
              {terminal ? (
                <CtaButton label={t("common.continue")} onPress={advance} />
              ) : (
                <>
                  <CtaButton
                    label={t("common.retry")}
                    onPress={() => void retry()}
                    busy={submitting}
                  />
                  <GhostButton label={t("common.continue")} onPress={advance} />
                </>
              )}
            </>
          ) : timedOut ? (
            <>
              <CtaButton
                label={t("demo.keepWaiting")}
                onPress={() => setDeadlineNonce((nonce) => nonce + 1)}
              />
              <GhostButton
                label={t("demo.continueWaiting")}
                onPress={() => {
                  analytics.capture("onboarding_demo_result", {
                    outcome: "timeout",
                  });
                  advance();
                }}
              />
            </>
          ) : null}
        </View>
      </View>
    );
  }

  if (phase === "paste") {
    return (
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Text style={styles.headline}>{t("demo.title")}</Text>
          <Text style={styles.support}>{t("demo.pasteHelp")}</Text>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("demo.pastePlaceholder")}
            placeholderTextColor={theme.colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            accessibilityLabel={t("demo.linkLabel")}
            style={styles.input}
            onSubmitEditing={() => submitUrl(draft)}
          />
          <Pressable onPress={() => void paste()} style={styles.pasteBtn}>
            <Text style={styles.pasteText}>{t("common.paste")}</Text>
          </Pressable>
        </View>

        <View style={styles.samples}>
          <Text style={styles.samplesLabel}>{t("demo.samples")}</Text>
          <View style={styles.sampleRow}>
            {DEMO_SAMPLES.map((candidate) =>
              candidate.chipKey === null ? null : (
                <Pressable
                  key={candidate.url}
                  onPress={() => setDraft(candidate.url)}
                  style={({ pressed }) => [
                    styles.sampleChip,
                    draft === candidate.url && styles.sampleChipActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.sampleLabel,
                      draft === candidate.url && styles.sampleLabelActive,
                    ]}
                  >
                    {t(candidate.chipKey)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        </View>

        {errorLine}

        <View style={styles.foot}>
          <CtaButton
            label={t("demo.save")}
            onPress={() => submitUrl(draft)}
            disabled={draft.trim() === ""}
            busy={submitting}
          />
          {continueAfterUsed ?? (
            <GhostButton
              label={t("demo.backToShare")}
              onPress={() => {
                setError(null);
                setReturnPhase("share");
                setPhase("share");
              }}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.headline}>{t("demo.title")}</Text>
        <Text style={styles.support}>{t("demo.shareHelp")}</Text>
      </View>

      <SamplePost sample={sample} />

      <View style={styles.sheet} accessibilityElementsHidden>
        <Text style={styles.sheetLabel}>{t("demo.shareSheet")}</Text>
        <View style={styles.apps}>
          <ShareApp icon="message" label={t("demo.messages")} />
          <View style={styles.app}>
            <Image
              source={APP_ICON}
              style={[styles.appIcon, styles.appIconShelvr]}
            />
            <Text style={[styles.appLabel, styles.appLabelShelvr]}>Shelvr</Text>
          </View>
          <ShareApp icon="envelope" label={t("demo.mail")} />
          <ShareApp icon="doc.text" label={t("demo.notes")} />
        </View>
      </View>

      {errorLine}

      <View style={styles.foot}>
        <CtaButton
          label={t("demo.saveToShelvr")}
          onPress={() => void openShareSheet()}
          busy={submitting}
        />
        {continueAfterUsed ?? (
          <GhostButton
            label={t("demo.pasteInstead")}
            onPress={() => {
              setError(null);
              setReturnPhase("paste");
              setPhase("paste");
            }}
          />
        )}
      </View>

      <DemoAuthSheet
        visible={phase === "auth" && !isAuthenticated}
        url={authRequest?.url ?? savingUrl ?? sample.url}
        sample={sample}
        onCancel={cancelAuth}
      />
    </View>
  );
}

function SamplePost({ sample }: { sample: DemoSample }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.post} accessibilityElementsHidden>
      <View style={styles.postHead}>
        <View style={styles.avatar} />
        <Text style={styles.postHandle}>{sample.domain}</Text>
      </View>
      <Image
        source={POST_IMAGES[sample.kind]}
        contentFit="cover"
        style={styles.postImage}
      />
      <View style={styles.postActions}>
        <AppSymbolIcon
          name="heart"
          size={20}
          tintColor={theme.colors.foreground}
        />
        <AppSymbolIcon
          name="message"
          size={20}
          tintColor={theme.colors.foreground}
        />
        <View style={styles.shareHighlight}>
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
      </View>
      <Text style={styles.caption} numberOfLines={2}>
        <Text style={styles.captionHandle}>{sample.domain} </Text>
        {sample.pageHeading}
      </Text>
    </View>
  );
}

function ShareApp({ icon, label }: { icon: AppSymbolName; label: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.app}>
      <View style={styles.appIcon}>
        <AppSymbolIcon name={icon} size={22} tintColor={theme.colors.muted} />
      </View>
      <Text style={styles.appLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const READING_STEPS: TextMessageKey[] = [
  "demo.stepSaved",
  "demo.stepReading",
  "demo.stepTitling",
  "demo.stepFiling",
];

function ReadingSteps() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.steps}>
      {READING_STEPS.map((key, index) => (
        <View key={key} style={[styles.stepRow, index > 1 && styles.stepTodo]}>
          <View style={[styles.stepDot, index === 0 && styles.stepDotDone]}>
            {index === 0 ? (
              <AppSymbolIcon
                name="checkmark"
                size={10}
                tintColor={theme.colors.primaryForeground}
              />
            ) : index === 1 ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : null}
          </View>
          <Text style={[styles.stepText, index === 1 && styles.stepNow]}>
            {t(key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DemoAuthSheet({
  visible,
  url,
  sample,
  onCancel,
}: {
  visible: boolean;
  url: string;
  sample: DemoSample;
  onCancel: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { signInWith, pendingProvider, lastError } = useOAuthSignIn();
  const busy = pendingProvider !== null;
  const pageHeading =
    url === sample.url ? sample.pageHeading : displayHost(url);

  const signIn = async (provider: OAuthProvider) => {
    const outcome = await signInWith(provider);
    if (outcome === "cancelled") onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? undefined : onCancel}
    >
      <Pressable
        style={styles.scrim}
        onPress={busy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      />
      <View style={styles.authSheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetHeadline}>{t("demo.signInTitle")}</Text>
        <Text style={styles.support}>{t("demo.signInHelp")}</Text>

        <View style={styles.linkRow}>
          <View style={styles.linkThumb}>
            <AppSymbolIcon
              name="link"
              size={18}
              tintColor={theme.colors.muted}
            />
          </View>
          <View style={styles.linkText}>
            <Text style={styles.linkHost} numberOfLines={1}>
              {pageHeading}
            </Text>
            <Text style={styles.linkUrl} numberOfLines={1}>
              {url}
            </Text>
          </View>
        </View>

        {!busy && lastError !== null ? (
          <Text style={styles.error}>{t("demo.signInFailed")}</Text>
        ) : null}

        {Platform.OS === "ios" ? (
          <Pressable
            onPress={() => void signIn("apple")}
            disabled={busy}
            style={({ pressed }) => [
              styles.authBtn,
              styles.authBtnApple,
              busy && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {pendingProvider === "apple" ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={[styles.authBtnText, styles.authBtnTextApple]}>
                {t("account.apple")}
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void signIn("google")}
          disabled={busy}
          style={({ pressed }) => [
            styles.authBtn,
            busy && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {pendingProvider === "google" ? (
            <ActivityIndicator color={theme.colors.foreground} />
          ) : (
            <Text style={styles.authBtnText}>{t("account.google")}</Text>
          )}
        </Pressable>
        {__DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true" ? (
          <GhostButton
            label={t("account.anonymous")}
            onPress={() => void signIn("anonymous")}
            disabled={busy}
          />
        ) : null}
        <Text style={styles.privacy}>{t("demo.privacyNote")}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  head: {
    gap: theme.gap(1),
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: theme.gap(2.5),
  },
  center: {
    textAlign: "center",
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  post: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
    gap: theme.gap(1),
  },
  postHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
  },
  postHandle: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  postImage: {
    height: 150,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
  },
  shareHighlight: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  captionHandle: {
    fontFamily: theme.fonts.bold,
  },
  sheet: {
    gap: theme.gap(1),
  },
  sheetLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  apps: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  app: {
    width: 64,
    alignItems: "center",
    gap: 6,
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: 13,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  appIconShelvr: {
    borderWidth: 2,
    borderColor: theme.colors.primarySoft,
  },
  appLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.muted,
  },
  appLabelShelvr: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  linkThumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  linkHost: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  linkUrl: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  steps: {
    alignSelf: "center",
    gap: theme.gap(1.5),
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
  },
  stepTodo: {
    opacity: 0.4,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  stepNow: {
    fontFamily: theme.fonts.bold,
  },
  inputRow: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
  },
  pasteBtn: {
    justifyContent: "center",
    paddingHorizontal: theme.gap(1.5),
  },
  pasteText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primary,
  },
  samples: {
    gap: theme.gap(1),
  },
  samplesLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  sampleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  sampleChip: {
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sampleChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  sampleLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
  sampleLabelActive: {
    color: theme.colors.primaryText,
  },
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  authSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    gap: theme.gap(1.5),
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  sheetHeadline: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  authBtn: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  authBtnApple: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  authBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  authBtnTextApple: {
    color: theme.colors.background,
  },
  privacy: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    textAlign: "center",
    color: theme.colors.faint,
  },
}));

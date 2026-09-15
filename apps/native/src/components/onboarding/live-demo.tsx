import { onboardingLabel } from "@/lib/onboarding-labels";
import type { TextMessageKey } from "@/locales/message-types";
import { t, useAppLocale } from "@/lib/i18n";
import type { FeedItem } from "@/components/item-card";
import { CtaButton } from "@/components/onboarding/parts";
import { RevealCard } from "@/components/onboarding/reveal-card";
import { buildRevealPieces, type RevealPiece } from "@/lib/reveal-pieces";
import { EASE_OUT, REDUCED_FADE_IN } from "@/lib/motion";
import { analytics } from "@/lib/analytics";
import {
  clearLegacyDemoUrlIfSaved,
  resolveOnboardingSpaceName,
  setPendingDemo,
  type PendingDemo,
} from "@/lib/pending-onboarding";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { demoErrorCode, isRateLimitedError } from "@convex/model/demoErrors";
import { isTerminalFailure } from "@convex/model/itemFields";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type LayoutAnimation,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useOAuthSignIn, type OAuthProvider } from "@/lib/oauth-sign-in";

// Step 6 — the gotcha. "Paste any link — watch Shelvr file it." Every path is
// REAL: one server-enforced demo save per authenticated user (api.demo
// .createDemoItem, no Pro needed), processed by the actual pipeline, revealed
// piece by piece as the real classified save. Pre-auth, submitting routes
// through an inline sign-in (no navigation, so onboarding state survives) with
// the pending save persisted, so an app kill mid-OAuth resumes the same save.
// There is no canned card — skip/error/timeout never claim a save happened.
//
// The persisted demo record (lib/pending-onboarding) means "this step has a
// save in flight": it is written on submit, kept through processing/reveal so
// a relaunch re-attaches to the same server item, and cleared the moment the
// step is left (advance or skip). Later steps never see it, so a relaunch on
// permissions/ready restores that step instead of replaying the save.

// Curated sample links — each is a real, classifiable page that exercises the
// pipeline end to end (fetch → readability → tag → file). Kept generic so they
// work regardless of which spaces the user just created.
const SAMPLE_LINKS: { label: TextMessageKey; url: string }[] = [
  {
    label: "demo.sampleRecipe",
    url: "https://www.bbcgoodfood.com/recipes/classic-lasagne",
  },
  { label: "demo.sampleArticle", url: "https://www.paulgraham.com/ds.html" },
  { label: "demo.sampleProduct", url: "https://www.apple.com/airpods-pro/" },
];

const TIMEOUT_MS = 15_000;

// How long the reveal waits before letting the next piece land. Keyed by piece
// kind so the pacing is a property of what is arriving, not of where it sits in
// the list: tags rattle off quickly, the destination gets a beat of its own.
const PIECE_DELAY_MS: Record<RevealPiece["kind"], number> = {
  image: 350,
  title: 300,
  tag: 180,
  space: 350,
  inbox: 350,
};

// The verdict lines rise rather than drop, so they read as the save settling
// into place under the card instead of two more pieces falling in.
const headlineEnter = (delayMs: number) => (): LayoutAnimation => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(1, { duration: 260 })),
      transform: [
        {
          translateY: withDelay(
            delayMs,
            withSpring(0, { damping: 18, stiffness: 180 }),
          ),
        },
      ],
    },
  };
};
const HEADLINE_ENTER = headlineEnter(0);
const HEADLINE_ENTER_STAGGERED = headlineEnter(80);

const COUNT_ROLL_MS = 220;
const COUNT_LINE_HEIGHT = 18;

// Travel is the line's own measured height rather than a constant, so the roll
// stays inside the clipped window at every accessibility text size.
const COUNT_ENTER = (values: EntryAnimationsValues): LayoutAnimation => {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: values.targetHeight }],
    },
    animations: {
      opacity: withTiming(1, { duration: COUNT_ROLL_MS, easing: EASE_OUT }),
      transform: [
        {
          translateY: withTiming(0, {
            duration: COUNT_ROLL_MS,
            easing: EASE_OUT,
          }),
        },
      ],
    },
  };
};

const COUNT_EXIT = (values: ExitAnimationsValues): LayoutAnimation => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: COUNT_ROLL_MS, easing: EASE_OUT }),
      transform: [
        {
          translateY: withTiming(-values.currentHeight, {
            duration: COUNT_ROLL_MS,
            easing: EASE_OUT,
          }),
        },
      ],
    },
  };
};

type DemoPhase = "input" | "auth" | "processing" | "reveal" | "failed";

export function LiveDemoStep({
  selectedSpaces,
  resumeDemo,
  onReady,
  onAdvance,
}: {
  /** Stable preset identities picked earlier in onboarding — offered as destination
   * OPTIONS only. The user's explicit single choice is what files the save. */
  selectedSpaces: string[];
  /** A demo captured before an earlier sign-in; resumes it exactly once. */
  resumeDemo: PendingDemo | null;
  /** Reports the classified save and the space names it actually landed in, so
   * later steps can show both without re-deriving either. */
  onReady: (item: FeedItem, savedSpaceNames: string[]) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { isAuthenticated } = useConvexAuth();
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const retryDemoItem = useMutation(api.demo.retryDemoItem);
  const { signInWith, pendingProvider, lastError } = useOAuthSignIn();

  const [url, setUrl] = useState(resumeDemo?.url ?? "");
  const [destination, setDestination] = useState<string | null>(
    resumeDemo?.destination ?? null,
  );
  const [itemId, setItemId] = useState<Id<"items"> | null>(null);
  // Snapshotted when the pipeline reports ready. The reveal stages its pieces
  // off this value, so later live-query ticks cannot restart the animation.
  const [revealItem, setRevealItem] = useState<FeedItem | null>(null);
  const [savedSpaces, setSavedSpaces] = useState<string[]>([]);
  const [reused, setReused] = useState(false);
  const [authRequest, setAuthRequest] = useState<PendingDemo | null>(
    resumeDemo,
  );
  // Mutation in flight only. Guarded by a ref so concurrent taps can't double
  // submit and the guard is always released (finally), including when the
  // component hands off to the auth view.
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [error, setError] = useState<TextMessageKey | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("input");
  // Set 15s into a processing run; the user — never a timer — decides between
  // keep waiting and continue. The live subscription keeps running either way.
  const [timedOut, setTimedOut] = useState(false);
  const [deadlineNonce, setDeadlineNonce] = useState(0);
  const advancedRef = useRef(false);

  // Subscribe to the item once we have an id — re-renders as the AI pipeline
  // fills in title/tags/spaces and flips status to ready.
  // 'skip', not `enabled`: a disabled React Query still subscribes through the
  // Convex adapter and sends `id: null`, which fails argument validation on
  // the server for every demo run.
  const itemQuery = useQuery(
    convexQuery(api.items.getItem, itemId === null ? "skip" : { id: itemId }),
  );
  const item = itemQuery.data;

  // Leaving the step ends the in-flight demo: clear the persisted record so a
  // relaunch restores the next step rather than replaying a completed save.
  const advance = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    setPendingDemo(null);
    onAdvance();
  };

  const toFeedItem = (row: NonNullable<typeof item>): FeedItem => ({
    _id: row._id,
    type: row.type,
    status: row.status,
    title: row.title,
    url: row.url,
    siteName: row.siteName,
    heroImageUrl: row.heroImageUrl,
    imageUrl: row.imageUrl,
    aspectRatio: row.aspectRatio,
    enrichment: row.enrichment,
    tags: row.tags,
  });

  // Lift the classified item up to the orchestrator exactly once (the recap
  // renders the same card the user just watched get filed), and surface the
  // failure state if classification fails.
  useEffect(() => {
    if (!item || !["processing", "failed", "reveal"].includes(phase)) return;
    if (item.status === "ready" && phase !== "reveal") {
      analytics.capture("onboarding_demo_result", { outcome: "ready" });
      const feedItem = toFeedItem(item);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("reveal");
      setRevealItem(feedItem);
      onReady(feedItem, savedSpaces);
    } else if (item.status === "failed" && phase !== "failed") {
      analytics.capture("onboarding_demo_result", { outcome: "failed" });
      setPhase("failed");
    } else if (item.status === "processing" && phase !== "processing") {
      setPhase("processing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, phase]);

  // A vanished save (deleted elsewhere, query error, auth blip) is reported
  // instead of spinning forever.
  useEffect(() => {
    if (itemId === null || phase !== "processing") return;
    if (itemQuery.isError || (itemQuery.isSuccess && item === null)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(itemQuery.isError ? "demo.loadFailed" : "demo.saveGone");
      setPhase("input");
    }
  }, [itemId, phase, item, itemQuery.isError, itemQuery.isSuccess]);

  // Processing deadline. Restarted by phase changes, a retry, or "keep
  // waiting" (deadlineNonce). Only flips the timedOut flag — no auto-advance.
  useEffect(() => {
    if (itemId === null || phase !== "processing") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the deadline clock when the effect re-arms
    setTimedOut(false);
    const id = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [itemId, phase, deadlineNonce]);

  const submit = useCallback(
    async (rawUrl: string, destinationOverride?: string | null) => {
      const trimmed = rawUrl.trim();
      if (trimmed === "" || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setError(null);
      setUrl(trimmed);
      const chosenDestination =
        destinationOverride !== undefined
          ? destinationOverride
          : destination === null
            ? null
            : resolveOnboardingSpaceName(destination);
      const request = { url: trimmed, destination: chosenDestination };
      setPendingDemo(request);

      // Not signed in yet: persist the exact save (URL + destination) so an
      // app kill mid-OAuth resumes it, then authenticate inline — staying on
      // this step, so spaces/survey state survive.
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
          url: trimmed,
          spaceName: chosenDestination ?? undefined,
          analyticsSessionId: analytics.sessionId(),
        });
        setSavedSpaces(result.savedSpaceNames);
        setReused(result.reused);
        setItemId(result.itemId);
        setPhase("processing");
        setPendingDemo({
          url: result.url,
          destination: result.savedSpaceNames[0] ?? null,
        });
        clearLegacyDemoUrlIfSaved(result.url);
      } catch (err) {
        // Structured ConvexError data, never `err.message`: production
        // redacts a plain server Error to "Server Error".
        const used = demoErrorCode(err) === "demo_used";
        analytics.capture("onboarding_demo_result", {
          outcome: used ? "already_used" : "error",
        });
        setError(used ? "demo.alreadyUsed" : "demo.saveFailed");
        setPhase("input");
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [createDemoItem, destination, isAuthenticated],
  );

  // Resume a demo captured before a previous sign-in. If the user is already
  // authenticated (returned from OAuth after an app kill), finish the save
  // they asked for — the server's idempotency makes this duplicate-proof.
  useEffect(() => {
    if (!isAuthenticated || authRequest === null) return;
    const request = authRequest;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the request after auth becomes ready
    setAuthRequest(null);
    void submit(request.url, request.destination);
  }, [isAuthenticated, authRequest, submit]);

  const backFromAuth = () => {
    setAuthRequest(null);
    setPendingDemo(null);
    setPhase("input");
  };

  const signIn = async (provider: OAuthProvider) => {
    const outcome = await signInWith(provider);
    if (outcome === "cancelled") backFromAuth();
    // 'failed': stay on the auth view — lastError renders below and the user
    // can retry or go back.
  };

  const retry = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await retryDemoItem({});
      if (result.scheduled) setDeadlineNonce((nonce) => nonce + 1);
      setPhase("processing");
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
    if (clipped.trim() !== "") setUrl(clipped.trim());
  };

  const destinationOptions: { label: string; value: string | null }[] = [
    { label: t("demo.justShelf"), value: null },
    ...selectedSpaces.map((name) => ({
      label: onboardingLabel(name),
      value: name,
    })),
  ];

  // ---- Auth state: inline sign-in so the demo save can be real -----------
  if (phase === "auth") {
    return (
      <DemoAuthView
        pendingProvider={pendingProvider}
        lastError={lastError}
        onSignIn={(provider) => void signIn(provider)}
        onBack={backFromAuth}
      />
    );
  }

  // ---- Reveal state: the real item, with its real destination ------------
  if (phase === "reveal") {
    return (
      <DemoRevealView
        url={url}
        item={revealItem}
        savedSpaces={savedSpaces}
        reused={reused}
        onAdvance={advance}
      />
    );
  }

  // ---- Failed state: honest failure with a real retry --------------------
  // A terminal failure (the page is gone) gets no Retry button: the server
  // refuses it anyway, mirroring reprocessItem, and offering one would only
  // end in an error line.
  if (phase === "failed") {
    const terminal = isTerminalFailure(item?.failureReason);
    return (
      <View style={styles.wrap}>
        <Text style={styles.headline}>{t("demo.linkSaved")}</Text>
        <Text style={styles.support}>
          {terminal ? t("demo.notFoundHelp") : t("demo.processingFailed")}
        </Text>

        {error !== null && <Text style={styles.error}>{t(error)}</Text>}

        <View style={styles.footer}>
          {terminal ? null : (
            <Pressable
              onPress={() => void retry()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                submitting && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.submitText}>{t("common.retry")}</Text>
              )}
            </Pressable>
          )}
          <Pressable onPress={advance}>
            <Text style={styles.skipText}>{t("common.continue")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Processing state: shimmer while the real pipeline runs ------------
  if (phase === "processing") {
    return (
      <View style={styles.wrap}>
        <Text style={styles.headline}>{t("demo.title")}</Text>
        <Text style={styles.support}>{t("demo.reading")}</Text>

        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.processingLine}>{t("demo.classifying")}</Text>
        </View>

        <View style={styles.footer}>
          {timedOut ? (
            <>
              <Text style={styles.support}>{t("demo.slow")}</Text>
              <View style={styles.timeoutRow}>
                <Pressable
                  onPress={() => setDeadlineNonce((nonce) => nonce + 1)}
                  style={({ pressed }) => [
                    styles.timeoutBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.continueText}>
                    {t("demo.keepWaiting")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    analytics.capture("onboarding_demo_result", {
                      outcome: "timeout",
                    });
                    advance();
                  }}
                >
                  <Text style={styles.skipText}>
                    {t("demo.continueWaiting")}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable onPress={advance}>
              <Text style={styles.skipText}>{t("demo.stillWorking")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ---- Input state: paste field, destination, sample links ---------------
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{t("demo.title")}</Text>
      <Text style={styles.support}>{t("demo.pasteHelp")}</Text>

      <View style={styles.inputRow}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder={t("demo.pastePlaceholder")}
          placeholderTextColor={theme.colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          accessibilityLabel={t("demo.linkLabel")}
          style={styles.input}
          onSubmitEditing={() => void submit(url)}
        />
        <Pressable onPress={() => void paste()} style={styles.pasteBtn}>
          <Text style={styles.pasteText}>{t("common.paste")}</Text>
        </Pressable>
      </View>

      <View style={styles.samples}>
        <Text style={styles.samplesLabel}>{t("demo.destination")}</Text>
        <View style={styles.sampleRow}>
          {destinationOptions.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: destination === option.value }}
              onPress={() => setDestination(option.value)}
              style={({ pressed }) => [
                styles.sampleChip,
                destination === option.value && styles.sampleChipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.sampleLabel,
                  destination === option.value && styles.sampleLabelActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error !== null && <Text style={styles.error}>{t(error)}</Text>}

      <View style={styles.samples}>
        <Text style={styles.samplesLabel}>{t("demo.samples")}</Text>
        <View style={styles.sampleRow}>
          {SAMPLE_LINKS.map((s) => (
            <Pressable
              key={s.url}
              onPress={() => void submit(s.url)}
              disabled={submitting}
              style={({ pressed }) => [
                styles.sampleChip,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.sampleLabel}>{t(s.label)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        {url.trim() !== "" && !submitting && (
          <Pressable
            onPress={() => void submit(url)}
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.submitText}>{t("demo.save")}</Text>
          </Pressable>
        )}
        <Pressable
          disabled={submitting}
          onPress={() => {
            analytics.capture("onboarding_demo_skipped");
            advance();
          }}
        >
          <Text style={styles.skipText}>{t("demo.skip")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// The payoff. The raw URL the user pasted stays on screen and dims while the
// classified save assembles itself underneath it, one piece at a time; the
// headline and the CTA only arrive once every piece has landed.
function DemoRevealView({
  url,
  item,
  savedSpaces,
  reused,
  onAdvance,
}: {
  url: string;
  item: FeedItem | null;
  savedSpaces: string[];
  reused: boolean;
  onAdvance: () => void;
}) {
  useAppLocale();
  const reducedMotion = useReducedMotion();
  const pieces = useMemo(
    () => (item === null ? [] : buildRevealPieces(item, savedSpaces)),
    [item, savedSpaces],
  );
  const [revealedCount, setRevealedCount] = useState(0);
  const visibleCount = reducedMotion ? pieces.length : revealedCount;
  const settled = visibleCount >= pieces.length;

  // The pasted URL stays legible until the classified card starts landing,
  // then steps back so the result is what the eye goes to.
  const rawUrlOpacity = useSharedValue(1);
  useEffect(() => {
    rawUrlOpacity.value = withTiming(visibleCount > 0 ? 0.4 : 1, {
      duration: 300,
    });
  }, [visibleCount, rawUrlOpacity]);
  const rawUrlStyle = useAnimatedStyle(() => ({
    opacity: rawUrlOpacity.value,
  }));

  useEffect(() => {
    if (pieces.length === 0) return;
    if (reducedMotion) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return;
    }
    if (revealedCount >= pieces.length) return;
    const id = setTimeout(() => {
      const next = revealedCount + 1;
      setRevealedCount(next);
      if (process.env.EXPO_OS !== "ios") return;
      if (next >= pieces.length) {
        // An impact rather than a success chime, so the last piece lands with
        // the same weight as the card's settle bump.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.selectionAsync();
      }
    }, PIECE_DELAY_MS[pieces[revealedCount].kind]);
    return () => clearTimeout(id);
  }, [pieces, revealedCount, reducedMotion]);

  return (
    <View style={styles.wrap}>
      <Animated.Text
        style={[styles.rawUrl, rawUrlStyle]}
        numberOfLines={2}
        ellipsizeMode="middle"
      >
        {url}
      </Animated.Text>

      {item !== null && (
        <RevealCard item={item} pieces={pieces} revealedCount={visibleCount} />
      )}

      {settled && (
        <View style={styles.verdict}>
          <Animated.Text
            entering={reducedMotion ? REDUCED_FADE_IN : HEADLINE_ENTER}
            style={styles.headline}
          >
            {t("demo.savedHeadline")}
          </Animated.Text>
          <Animated.Text
            entering={
              reducedMotion ? REDUCED_FADE_IN : HEADLINE_ENTER_STAGGERED
            }
            style={styles.firstSave}
          >
            {t("demo.firstSave")}
          </Animated.Text>
          <RollingCount reducedMotion={reducedMotion} />
        </View>
      )}

      {settled && item?.enrichment === "partial" ? (
        <Text style={styles.support}>{t("demo.partial")}</Text>
      ) : null}
      {settled && reused ? (
        <Text style={styles.reuseNote}>{t("demo.usedHelp")}</Text>
      ) : null}

      <View style={styles.footer}>
        {settled && (
          <Animated.View
            entering={FadeInDown.delay(240).duration(400)}
            style={styles.fullWidth}
          >
            <CtaButton label={t("common.continue")} onPress={onAdvance} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// The shelf tally is a real count, not a literal one. It starts empty and turns
// over once the verdict has landed, so the user watches their shelf gain the
// save rather than being told it already has it.
function RollingCount({ reducedMotion }: { reducedMotion: boolean }) {
  useAppLocale();
  const { fontScale } = useWindowDimensions();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = setTimeout(() => setCount(1), 400);
    return () => clearTimeout(id);
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <View style={styles.countWindow}>
        <Text style={styles.shelfCount}>
          {t("demo.shelfCount", { count: 1 })}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.countWindow, { height: COUNT_LINE_HEIGHT * fontScale }]}
    >
      <Animated.Text
        key={count}
        entering={COUNT_ENTER}
        exiting={COUNT_EXIT}
        style={[styles.shelfCount, styles.countLine]}
      >
        {t("demo.shelfCount", { count })}
      </Animated.Text>
    </View>
  );
}

function DemoAuthView({
  pendingProvider,
  lastError,
  onSignIn,
  onBack,
}: {
  pendingProvider: OAuthProvider | null;
  lastError: string | null;
  onSignIn: (provider: OAuthProvider) => void;
  onBack: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{t("demo.signInTitle")}</Text>
      <Text style={styles.support}>{t("demo.signInHelp")}</Text>

      {pendingProvider === null && lastError !== null && (
        <Text style={styles.error}>{t("demo.signInFailed")}</Text>
      )}

      <View style={styles.authButtons}>
        {Platform.OS === "ios" ? (
          <Pressable
            onPress={() => onSignIn("apple")}
            disabled={pendingProvider !== null}
            style={({ pressed }) => [
              styles.authBtn,
              styles.authBtnApple,
              pendingProvider !== null && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[styles.authBtnText, { color: theme.colors.background }]}
            >
              {t("account.apple")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onSignIn("google")}
          disabled={pendingProvider !== null}
          style={({ pressed }) => [
            styles.authBtn,
            pendingProvider !== null && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.authBtnText}>{t("account.google")}</Text>
        </Pressable>
        {__DEV__ &&
          process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true" && (
            <Pressable onPress={() => onSignIn("anonymous")}>
              <Text style={styles.skipText}>{t("account.anonymous")}</Text>
            </Pressable>
          )}
        <Pressable onPress={onBack}>
          <Text style={styles.skipText}>{t("common.back")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
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
    color: theme.colors.muted,
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
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
  },
  authButtons: {
    gap: theme.gap(1.5),
  },
  authBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(1.75),
    alignItems: "center",
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
  processingCard: {
    alignItems: "center",
    gap: theme.gap(2),
    paddingVertical: theme.gap(5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
  },
  processingLine: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
  rawUrl: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: theme.colors.faint,
  },
  verdict: {
    gap: 2,
  },
  firstSave: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.muted,
  },
  shelfCount: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: COUNT_LINE_HEIGHT,
    color: theme.colors.muted,
  },
  countWindow: {
    marginTop: theme.gap(0.75),
    overflow: "hidden",
  },
  countLine: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  reuseNote: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  timeoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
  },
  timeoutBtn: {
    paddingVertical: theme.gap(0.5),
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    alignItems: "center",
    alignSelf: "stretch",
  },
  submitText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.primaryForeground,
  },
  fullWidth: {
    width: "100%",
  },
  continueText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.primary,
  },
  skipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));

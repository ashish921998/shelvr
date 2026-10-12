import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { useEntitlement } from "@/lib/entitlement";
import type { DemoSample } from "@/lib/onboarding-demo";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { presentShareSheet, useShareArrival } from "@/lib/share/share-sheet";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import {
  SampleCard,
  SampleRow,
  ShareHint,
} from "@/components/onboarding/sample-card";
import { CelebrationBadge } from "@/components/onboarding/celebration";
import { settleIn } from "@/lib/motion";
import * as Haptics from "expo-haptics";
import { getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

// The done screen arrives in beats: the badge settles, then the words, then the
// shared link lands, then the way on.
const SETTLE_TITLE = settleIn(200);
const SETTLE_BODY = settleIn(350);
const SETTLE_ROW = settleIn(600);
const SETTLE_CTA = settleIn(850);

/** "received" means the share reached Shelvr and waits for the share
 * screen, which saves it after onboarding; nothing is saved here. */
type Outcome = "received" | "other_app" | "skipped" | "sheet_failed";

/** The shares expo-sharing holds, as one comparable value; "" for none.
 * Android replaces the held batch instead of adding to it, so a new share
 * shows as a different batch, not always as a longer one. */
function heldShares(): string {
  try {
    const payloads = getSharedPayloads();
    return payloads.length === 0 ? "" : JSON.stringify(payloads);
  } catch (err) {
    analytics.captureError("onboarding_share_practice_read_failed", err);
    return "";
  }
}

/**
 * After the first save and before the paywall: one save through the real share
 * sheet, so the Shelvr tile is found once while help is on screen. The
 * shared link is not saved here. It stays in expo-sharing, flagged for the
 * share screen, which saves it the normal way once onboarding finishes.
 */
export function SharePracticeStep({
  sample,
  leaving,
  onFinish,
}: {
  /** A sample other than the one saved in the demo. */
  sample: DemoSample | undefined;
  /** `onFinish` ran and the paywall is on its way: nothing here takes taps. */
  leaving: boolean;
  /** Leaves onboarding; the screen puts the paywall in front of the app. */
  onFinish: () => void;
}) {
  useAppLocale();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [received, setReceived] = useState(false);
  const [wrongApp, setWrongApp] = useState(false);
  const reported = useRef(false);
  const receivedRef = useRef(false);
  // A share held from before this step (one the demo left for the share
  // screen). The practice only runs when there is none, so any share that
  // shows up during it is the practice share.
  const [waiting] = useState(heldShares);
  const hasIncomingShare = useCallback(() => heldShares() !== "", []);

  const report = useCallback((outcome: Outcome) => {
    if (outcome !== "other_app") {
      if (reported.current) return;
      reported.current = true;
    }
    analytics.capture("onboarding_share_practice", { outcome });
  }, []);

  // The foreground listener and the share result can both see one share.
  const markReceived = useCallback(() => {
    if (receivedRef.current) return;
    receivedRef.current = true;
    try {
      markPendingShareOnDevice();
    } catch (err) {
      analytics.captureError("onboarding_hold_share_failed", err);
    }
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setWrongApp(false);
    setReceived(true);
    report("received");
  }, [report]);

  // Android hands a share to Shelvr by relaunching it, so the payload is
  // noticed when the app comes back rather than from the share result.
  useShareArrival(
    useCallback(() => {
      if (hasIncomingShare()) markReceived();
    }, [hasIncomingShare, markReceived]),
    false,
  );

  const share = async () => {
    if (sample === undefined) return;
    setWrongApp(false);
    setSheetOpen(true);
    const result = await presentShareSheet(sample.url, hasIncomingShare);
    setSheetOpen(false);
    if (result === "shelvr") {
      markReceived();
    } else if (result === "other_app") {
      setWrongApp(true);
      report("other_app");
    } else if (result === "failed") {
      report("sheet_failed");
      onFinish();
    }
  };

  const skip = () => {
    report("skipped");
    onFinish();
  };

  // A share is already held for the share screen, and a practice share would
  // replace it. Someone who shared to Shelvr on their own needs no practice.
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });
  useEffect(() => {
    if (waiting === "") return;
    report("skipped");
    finishRef.current();
  }, [waiting, report]);
  if (waiting !== "") return null;

  if (received) {
    return (
      <View style={styles.wrap}>
        <View style={styles.done}>
          <CelebrationBadge />
          <Animated.Text
            entering={SETTLE_TITLE}
            style={[styles.doneTitle, styles.center]}
            maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          >
            {t("sharePractice.savedTitle")}
          </Animated.Text>
          <Animated.Text
            entering={SETTLE_BODY}
            style={[styles.support, styles.center]}
          >
            {t("sharePractice.savedBody")}
          </Animated.Text>
          {/* The link they just shared, landing: "on your shelf" has
              something to point at. */}
          {sample === undefined ? null : (
            <Animated.View
              entering={SETTLE_ROW}
              style={styles.shared}
              pointerEvents="none"
            >
              <SampleRow sample={sample} icon="checkmark" disabled={false} />
            </Animated.View>
          )}
        </View>
        <Animated.View entering={SETTLE_CTA}>
          {/* Saving is Pro: anyone without it gets the paywall from here. */}
          <CtaButton
            label={t(
              entitled || entitlementLoading
                ? "sharePractice.toShelf"
                : "reveal.keepSaving",
            )}
            onPress={onFinish}
            busy={leaving}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("sharePractice.title")}
        </Text>
        <Text style={styles.support}>{t("sharePractice.body")}</Text>
      </View>

      {sample === undefined ? null : (
        <SampleCard
          sample={sample}
          action="share"
          disabled={sheetOpen || leaving}
          onPress={() => void share()}
        />
      )}
      {wrongApp ? (
        <Text style={styles.error}>{t("demo.pickShelvr")}</Text>
      ) : null}
      <ShareHint />
      <Text style={styles.tip}>
        {t(
          Platform.OS === "ios"
            ? "sharePractice.tipIos"
            : "sharePractice.tipAndroid",
        )}
      </Text>

      <View style={styles.foot}>
        <GhostButton
          label={t("sharePractice.later")}
          onPress={skip}
          disabled={sheetOpen || leaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  head: {
    gap: theme.gap(1),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  tip: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.faint,
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
  done: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1.5),
  },
  doneTitle: {
    marginTop: theme.gap(2),
    fontFamily: theme.fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: theme.colors.foreground,
  },
  center: {
    textAlign: "center",
  },
  shared: {
    alignSelf: "stretch",
    marginTop: theme.gap(2),
  },
}));

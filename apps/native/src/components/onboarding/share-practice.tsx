import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { DemoSample } from "@/lib/onboarding-demo";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { presentShareSheet, useShareArrival } from "@/lib/share/share-sheet";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { SampleRow } from "@/components/onboarding/sample-card";
import {
  PracticePost,
  ShareSteps,
} from "@/components/onboarding/practice-post";
import { CelebrationBadge } from "@/components/onboarding/celebration";
import { settleIn } from "@/lib/motion";
import * as Haptics from "expo-haptics";
import { getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const SETTLE_TITLE = settleIn(200);
const SETTLE_BODY = settleIn(350);
const SETTLE_ROW = settleIn(600);
const SETTLE_CTA = settleIn(850);

type Outcome =
  | "received"
  | "other_app"
  | "dismissed"
  | "sheet_stuck"
  | "skipped"
  | "sheet_failed";

// The sheet covers the step once it is up, so a tap on the post this long
// after asking for it means iOS never showed it. A quicker tap is a double
// tap while the sheet slides up.
const SHEET_STUCK_MS = 2000;

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

export function SharePracticeStep({
  sample,
  leaving,
  onFinish,
}: {
  sample: DemoSample | undefined;
  leaving: boolean;
  onFinish: () => void;
}) {
  useAppLocale();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [received, setReceived] = useState(false);
  const [wrongApp, setWrongApp] = useState(false);
  const reported = useRef(false);
  const receivedRef = useRef(false);
  const [waiting] = useState(heldShares);
  const hasIncomingShare = useCallback(() => heldShares() !== "", []);

  const report = useCallback((outcome: Outcome) => {
    if (
      outcome === "received" ||
      outcome === "skipped" ||
      outcome === "sheet_failed"
    ) {
      if (reported.current) return;
      reported.current = true;
    }
    analytics.capture("onboarding_share_practice", { outcome });
  }, []);

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

  const pendingSince = useRef<number | null>(null);
  const settling = useRef(false);
  const attempt = useRef(0);

  const share = async () => {
    if (sample === undefined || settling.current) return;
    if (pendingSince.current !== null) {
      if (Date.now() - pendingSince.current < SHEET_STUCK_MS) return;
      report("sheet_stuck");
    }
    const current = ++attempt.current;
    pendingSince.current = Date.now();
    setWrongApp(false);
    setSheetOpen(true);
    const result = await presentShareSheet(sample.url, hasIncomingShare, () => {
      if (current !== attempt.current) return;
      pendingSince.current = null;
      settling.current = true;
    });
    if (current !== attempt.current) return;
    pendingSince.current = null;
    settling.current = false;
    setSheetOpen(false);
    if (result === "shelvr") {
      markReceived();
    } else if (result === "other_app") {
      setWrongApp(true);
      report("other_app");
    } else if (result === "dismissed") {
      report("dismissed");
    } else if (result === "failed") {
      report("sheet_failed");
      onFinish();
    }
  };

  const skip = () => {
    attempt.current += 1;
    pendingSince.current = null;
    settling.current = false;
    report("skipped");
    onFinish();
  };

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
          <CtaButton
            label={t("common.continue")}
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
        <Text style={styles.eyebrow}>{t("sharePractice.eyebrow")}</Text>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("sharePractice.title")}
        </Text>
        <Text style={styles.support}>{t("sharePractice.subtitle")}</Text>
      </View>

      <ShareSteps active={sheetOpen ? 2 : 1} />
      {sample === undefined ? null : (
        <PracticePost
          sample={sample}
          disabled={leaving}
          onPress={() => void share()}
        />
      )}
      {wrongApp ? (
        <Text style={styles.error}>{t("demo.pickShelvr")}</Text>
      ) : null}

      <View style={styles.foot}>
        <Text style={[styles.tip, styles.center]}>
          {t(
            Platform.OS === "ios"
              ? "sharePractice.tipIos"
              : "sharePractice.tipAndroid",
          )}
        </Text>
        {sample === undefined ? null : (
          <CtaButton
            label={t("demo.shareThis")}
            onPress={() => void share()}
            disabled={leaving}
          />
        )}
        <GhostButton
          label={t("sharePractice.later")}
          onPress={skip}
          disabled={leaving}
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
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
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

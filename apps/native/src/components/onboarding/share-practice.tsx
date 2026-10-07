import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { DemoSample } from "@/lib/onboarding-demo";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { presentShareSheet, useShareArrival } from "@/lib/share/share-sheet";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { SampleCard, ShareHint } from "@/components/onboarding/sample-card";
import * as Haptics from "expo-haptics";
import { getSharedPayloads } from "expo-sharing";
import { useCallback, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** "received" means the share reached Shelvr and waits for the share
 * screen, which saves it after onboarding; nothing is saved here. */
type Outcome = "received" | "other_app" | "skipped" | "sheet_failed";

function sharedPayloadCount(): number {
  try {
    return getSharedPayloads().length;
  } catch (err) {
    analytics.captureError("onboarding_share_practice_read_failed", err);
    return 0;
  }
}

/**
 * After the first save and the paywall: one save through the real share
 * sheet, so the Shelvr tile is found once while help is on screen. The
 * shared link is not saved here. It stays in expo-sharing, flagged for the
 * share screen, which saves it the normal way once onboarding finishes.
 */
export function SharePracticeStep({
  sample,
  onFinish,
}: {
  /** A sample other than the one saved in the demo. */
  sample: DemoSample | undefined;
  onFinish: () => void;
}) {
  useAppLocale();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [received, setReceived] = useState(false);
  const [wrongApp, setWrongApp] = useState(false);
  const reported = useRef(false);
  const receivedRef = useRef(false);
  // A share still waiting from before this step (one the demo left for the
  // share screen) is not this practice share; only a new payload counts.
  const [waiting] = useState(sharedPayloadCount);
  const hasIncomingShare = useCallback(
    () => sharedPayloadCount() > waiting,
    [waiting],
  );

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

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t(received ? "sharePractice.savedTitle" : "sharePractice.title")}
        </Text>
        <Text style={styles.support}>
          {t(received ? "sharePractice.savedBody" : "sharePractice.body")}
        </Text>
      </View>

      {received ? null : (
        <>
          {sample === undefined ? null : (
            <SampleCard
              sample={sample}
              action="share"
              disabled={sheetOpen}
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
        </>
      )}

      <View style={styles.foot}>
        {received ? (
          <CtaButton label={t("sharePractice.toShelf")} onPress={onFinish} />
        ) : (
          <GhostButton
            label={t("sharePractice.later")}
            onPress={skip}
            disabled={sheetOpen}
          />
        )}
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
}));

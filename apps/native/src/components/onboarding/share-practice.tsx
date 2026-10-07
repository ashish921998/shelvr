import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { DemoSample } from "@/lib/onboarding-demo";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { SHARE_SHEET_DISMISS_MS } from "@/lib/use-incoming-share-url";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { SampleCard, ShareHint } from "@/components/onboarding/live-demo";
import * as Haptics from "expo-haptics";
import { getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Share, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const SHARE_EXTENSION_SUFFIX = ".expo-sharing-extension";

type Outcome = "saved" | "other_app" | "skipped" | "sheet_failed";

function hasIncomingShare(): boolean {
  try {
    return getSharedPayloads().length > 0;
  } catch (err) {
    analytics.captureError("onboarding_share_practice_read_failed", err);
    return false;
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
  const [saved, setSaved] = useState(false);
  const [wrongApp, setWrongApp] = useState(false);
  const reported = useRef(false);

  const report = useCallback((outcome: Outcome) => {
    if (outcome !== "other_app") {
      if (reported.current) return;
      reported.current = true;
    }
    analytics.capture("onboarding_share_practice", { outcome });
  }, []);

  const markSaved = useCallback(() => {
    try {
      markPendingShareOnDevice();
    } catch (err) {
      analytics.captureError("onboarding_hold_share_failed", err);
    }
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setWrongApp(false);
    setSaved(true);
    report("saved");
  }, [report]);

  // Android hands a share to Shelvr by relaunching it, so the payload is
  // noticed when the app comes back rather than from the share result.
  useEffect(() => {
    const check = () => {
      if (!saved && hasIncomingShare()) markSaved();
    };
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    const links = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("expo-sharing")) check();
    });
    return () => {
      appState.remove();
      links.remove();
    };
  }, [saved, markSaved]);

  const share = async () => {
    if (sample === undefined) return;
    setWrongApp(false);
    setSheetOpen(true);
    let result: Awaited<ReturnType<typeof Share.share>>;
    try {
      result = await Share.share(
        Platform.OS === "ios" ? { url: sample.url } : { message: sample.url },
      );
    } catch (err) {
      analytics.captureError("onboarding_share_practice_sheet_failed", err);
      setSheetOpen(false);
      report("sheet_failed");
      onFinish();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, SHARE_SHEET_DISMISS_MS));
    setSheetOpen(false);
    if (
      hasIncomingShare() ||
      result.activityType?.endsWith(SHARE_EXTENSION_SUFFIX)
    ) {
      markSaved();
      return;
    }
    // Android cannot say which app received the share.
    if (Platform.OS === "ios" && result.action === Share.sharedAction) {
      setWrongApp(true);
      report("other_app");
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
          {t(saved ? "sharePractice.savedTitle" : "sharePractice.title")}
        </Text>
        <Text style={styles.support}>
          {t(saved ? "sharePractice.savedBody" : "sharePractice.body")}
        </Text>
      </View>

      {saved ? null : (
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
        {saved ? (
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

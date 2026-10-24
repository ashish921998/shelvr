import { AhaReel } from "@/components/onboarding/aha-reel";
import { QuestionTitle, ScalePressable } from "@/components/onboarding/parts";
import {
  AppPanel,
  AppsSheet,
  Coach,
  IosSheet,
} from "@/components/onboarding/share-sheets";
import type { AhaSample } from "@/lib/aha-sample";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** Long enough to read "Finding the spots…", short enough not to feel like waiting. */
const READING_MS = 1200;

/** The real path through a video app, one tap per screen, with the pin tip where iOS puts Edit. */
type Stage = "post" | "panel" | "sheet" | "tip" | "pick" | "reading";

function tick() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
}

/** A small card floating over the reel, so the Apps list below stays the thing they are looking at. */
function Tip({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.tip}>
      <View style={styles.tipRow}>
        <View style={styles.tipBadge}>
          <Text style={styles.tipEmoji}>💡</Text>
        </View>
        <View style={styles.tipText}>
          <Text style={styles.tipTitle}>{t("aha.tipTitle")}</Text>
          <Text style={styles.tipBody}>{t("aha.tipBody")}</Text>
        </View>
      </View>
      <ScalePressable
        accessibilityRole="button"
        onPress={onDone}
        style={styles.tipButton}
      >
        <Text style={styles.tipButtonText}>{t("aha.tipOk")}</Text>
      </ScalePressable>
    </View>
  );
}

/** The sample reel, shared to Shelvr the way they will from a real app: Share, Share, More, Shelvr. */
export function AhaShareStep({
  sample,
  onShared,
}: {
  sample: AhaSample;
  onShared: () => void;
}) {
  useAppLocale();
  const [stage, setStage] = useState<Stage>("post");
  const sharedRef = useRef(false);
  const go = (next: Stage) => () => {
    tick();
    setStage(next);
  };
  const pick = () => {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setStage("reading");
  };

  useEffect(() => {
    if (stage !== "reading") return;
    const timer = setTimeout(() => {
      if (sharedRef.current) return;
      sharedRef.current = true;
      onShared();
    }, READING_MS);
    return () => clearTimeout(timer);
  }, [stage, onShared]);

  return (
    <View style={styles.wrap}>
      <QuestionTitle title={t("aha.shareTitle")} />
      <View style={styles.stage}>
        <AhaReel
          sample={sample}
          onShare={stage === "post" ? go("panel") : undefined}
          dimmed={stage !== "post"}
        />
        {stage === "panel" ? <AppPanel onShare={go("sheet")} /> : null}
        {stage === "sheet" ? (
          <IosSheet title={sample.handle} onMore={go("tip")} />
        ) : null}
        {stage === "tip" ? (
          <AppsSheet top={<Tip onDone={go("pick")} />} />
        ) : null}
        {stage === "pick" ? (
          <AppsSheet
            top={<Coach label={t("aha.coachShelvr")} />}
            onPick={pick}
          />
        ) : null}
        {stage === "reading" ? (
          <Animated.View entering={fadeIn} style={styles.reading}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.readingText}>{t("aha.reading")}</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  stage: {
    flex: 1,
  },
  tip: {
    marginHorizontal: theme.gap(1.5),
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)",
  },
  tipRow: {
    flexDirection: "row",
    gap: theme.gap(1.25),
  },
  tipBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  tipEmoji: {
    fontSize: 18,
  },
  tipText: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  tipTitle: {
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  tipBody: {
    ...theme.type.footnote,
    color: theme.colors.muted,
  },
  tipButton: {
    alignSelf: "flex-end",
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    borderRadius: 999,
    backgroundColor: theme.colors.foreground,
  },
  tipButtonText: {
    ...theme.type.subheadLabel,
    fontFamily: theme.fonts.bold,
    color: theme.colors.background,
  },
  reading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1.5),
  },
  readingText: {
    ...theme.type.headline,
    color: "#FFFFFF",
  },
}));

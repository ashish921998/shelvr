import { AhaReel } from "@/components/onboarding/aha-reel";
import { QuestionTitle } from "@/components/onboarding/parts";
import {
  AppPanel,
  AppsSheet,
  IosSheet,
  tick,
} from "@/components/onboarding/share-sheets";
import type { AhaSample } from "@/lib/aha-sample";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import { haptics } from "@/lib/haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** Long enough to read "Finding the spots…", short enough not to feel like waiting. */
const READING_MS = 1200;

/** A practice share, one tap per screen, without changing system settings. */
type Stage = "post" | "panel" | "sheet" | "apps" | "reading";

/** The sample reel: Share, Share to…, More, Shelvr, then its spots on the map. */
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
    void haptics.impact("medium");
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
          <IosSheet title={sample.creator} onMore={go("apps")} />
        ) : null}
        {stage === "apps" ? <AppsSheet onPick={pick} /> : null}
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

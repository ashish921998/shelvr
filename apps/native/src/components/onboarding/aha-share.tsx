import { AhaReel } from "@/components/onboarding/aha-reel";
import { QuestionTitle, ScalePressable } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import type { AhaSample } from "@/lib/aha-sample";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { motion, sheetIn, sheetOut } from "@/lib/motion";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The sheet rises once the step has settled, so the reel registers first. */
const SHEET_DELAY_MS = motion.duration.spring;

const APP_ICON = require("../../../assets/icon.png");

function Target({
  label,
  highlighted,
  onPress,
  children,
}: {
  label: string;
  highlighted?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={onPress === undefined}
      onPress={onPress}
      style={styles.target}
    >
      <View style={[styles.targetIcon, highlighted && styles.targetOn]}>
        {children}
      </View>
      <Text
        style={[styles.targetLabel, highlighted && styles.targetLabelOn]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </ScalePressable>
  );
}

/** The sample reel with a drawn share sheet; tapping Shelvr in it is the save. */
export function AhaShareStep({
  sample,
  onShared,
}: {
  sample: AhaSample;
  onShared: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const sharedRef = useRef(false);
  const [shared, setShared] = useState(false);
  const share = () => {
    if (sharedRef.current) return;
    sharedRef.current = true;
    // Same frame as the sheet starting down.
    if (process.env.EXPO_OS === "ios") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShared(true);
    onShared();
  };
  return (
    <View style={styles.wrap}>
      <QuestionTitle title={t("aha.shareTitle")} />
      <View style={styles.stage}>
        <AhaReel sample={sample} />
        {shared ? null : (
          <Animated.View
            entering={sheetIn(reduced, SHEET_DELAY_MS)}
            exiting={sheetOut(reduced)}
            style={styles.sheet}
          >
            <View style={styles.targets}>
              <Target label={t("aha.shareMessages")}>
                <AppSymbolIcon
                  name="message.fill"
                  size={22}
                  tintColor={theme.colors.muted}
                />
              </Target>
              <Target label="Shelvr" highlighted onPress={share}>
                <Image source={APP_ICON} style={styles.appIcon} />
              </Target>
              <Target label={t("aha.shareCopyLink")}>
                <AppSymbolIcon
                  name="link"
                  size={22}
                  tintColor={theme.colors.muted}
                />
              </Target>
            </View>
            <Text style={styles.hint}>{t("aha.shareHint")}</Text>
          </Animated.View>
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
  stage: {
    flex: 1,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(2),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    // No blur module ships in the app, so the sheet is near-opaque: content shows through without hurting the labels.
    backgroundColor: withAlpha(theme.colors.surface, 0.94),
    boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.18)",
  },
  targets: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  target: {
    width: 88,
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  targetIcon: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  targetOn: {
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    transform: [{ scale: 1.08 }],
  },
  appIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
  },
  targetLabel: {
    ...theme.type.captionLabel,
    color: theme.colors.muted,
  },
  targetLabelOn: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
  hint: {
    ...theme.type.footnote,
    textAlign: "center",
    color: theme.colors.primaryText,
  },
}));

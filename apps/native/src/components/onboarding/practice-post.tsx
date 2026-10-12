import { t, useAppLocale } from "@/lib/i18n";
import type { DemoSample } from "@/lib/onboarding-demo";
import { AppSymbolIcon } from "@/components/symbol";
import { sampleImage } from "@/components/onboarding/sample-card";
import { Image } from "expo-image";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The share practice: a pretend post, styled like one in a social app, with a
// coach mark on its Share button, and the two steps the real sheet takes.

const APP_ICON = require("../../../assets/icon.png");
const SHARE_SIZE = 40;

/** A ring that breathes out from the Share button, so the eye lands there. */
function Pulse() {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    progress.set(
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
        -1,
      ),
    );
  }, [progress, reducedMotion]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - progress.get()),
    transform: [{ scale: 1 + 0.6 * progress.get() }],
  }));
  if (reducedMotion) return null;
  return <Animated.View pointerEvents="none" style={[styles.pulse, ring]} />;
}

/** The pretend post. The whole card opens the real share sheet; the coach
 * mark points at its Share button, which is where the tap belongs in any app. */
export function PracticePost({
  sample,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  disabled: boolean;
  onPress: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("demo.shareThis")}, ${sample.pageHeading}, ${sample.domain}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.post,
          disabled ? { opacity: 0.4 } : pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.byline}>
          <Image
            source={sampleImage(sample)}
            contentFit="cover"
            style={styles.avatar}
          />
          <Text style={styles.author} numberOfLines={1}>
            {sample.domain}
          </Text>
        </View>
        <Image
          source={sampleImage(sample)}
          contentFit="cover"
          style={styles.image}
        />
        <Text style={styles.title} numberOfLines={2}>
          {sample.pageHeading}
        </Text>
        <View style={styles.actions}>
          <AppSymbolIcon
            name="heart"
            size={20}
            tintColor={theme.colors.faint}
          />
          <AppSymbolIcon
            name="message"
            size={20}
            tintColor={theme.colors.faint}
          />
          <View style={styles.spacer} />
          <View style={styles.shareWrap}>
            {disabled ? null : <Pulse />}
            <View style={styles.share}>
              <AppSymbolIcon
                name="square.and.arrow.up"
                size={18}
                tintColor={theme.colors.primaryForeground}
              />
            </View>
          </View>
        </View>
      </Pressable>
      <View style={styles.coachRow} pointerEvents="none">
        <View style={styles.coach}>
          <View style={styles.caret} />
          <Text style={styles.coachText}>{t("sharePractice.stepShare")}</Text>
        </View>
      </View>
    </View>
  );
}

/** The two taps, in order: this step is the first, the share sheet holds the
 * second. Shelvr's own icon shows what to look for in the sheet. */
export function ShareSteps() {
  useAppLocale();
  return (
    <View style={styles.steps}>
      <View style={[styles.step, styles.stepOn]}>
        <Text style={styles.stepNumber}>1</Text>
        <Text style={styles.stepText}>{t("sharePractice.stepShare")}</Text>
      </View>
      <View style={styles.step}>
        <Text style={styles.stepNumber}>2</Text>
        <Image source={APP_ICON} style={styles.stepIcon} />
        <Text style={styles.stepText}>{t("sharePractice.stepShelvr")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  post: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  byline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
  },
  author: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.primarySoft,
  },
  title: {
    paddingHorizontal: theme.gap(1.5),
    paddingTop: theme.gap(1.25),
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(1.5),
    paddingTop: theme.gap(0.75),
    paddingBottom: theme.gap(1.25),
  },
  spacer: {
    flex: 1,
  },
  shareWrap: {
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    borderRadius: SHARE_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  share: {
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    borderRadius: SHARE_SIZE / 2,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  coachRow: {
    alignItems: "flex-end",
    marginTop: theme.gap(1),
  },
  coach: {
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(0.75),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  // A small diamond under the bubble's top edge, lined up with the button.
  caret: {
    position: "absolute",
    top: -5,
    right: theme.gap(1.5) + SHARE_SIZE / 2 - 5,
    width: 10,
    height: 10,
    transform: [{ rotate: "45deg" }],
    backgroundColor: theme.colors.primary,
  },
  coachText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryForeground,
  },
  steps: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  step: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    padding: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stepOn: {
    borderColor: theme.colors.primary,
  },
  stepNumber: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  stepIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderCurve: "continuous",
  },
  stepText: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
}));

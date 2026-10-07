import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";

const HOLD_MS = 900;

/** The primary CTA used by every step's footer. */
export function CtaButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { theme } = useUnistyles();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.cta,
        disabled && styles.ctaDisabled,
        pressed && !inactive && { opacity: 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.primaryForeground} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * The primary CTA as a press-and-hold: a fill runs across the button while it
 * is held, and only a full hold counts, with a light tap of haptics. Letting
 * go early drains the fill. Assistive tech activates it directly.
 */
export function HoldButton({
  label,
  hint,
  onComplete,
  busy,
}: {
  label: string;
  hint: string;
  onComplete: () => void;
  busy?: boolean;
}) {
  const { theme } = useUnistyles();
  const progress = useSharedValue(0);
  const completed = useRef(false);

  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    if (process.env.EXPO_OS !== "web")
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onComplete();
  };

  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!busy, busy: !!busy }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={() => {
        if (!busy) complete();
      }}
      disabled={busy}
      onPressIn={() => {
        if (completed.current) return;
        progress.set(
          withTiming(
            1,
            { duration: HOLD_MS, easing: Easing.linear },
            (done) => {
              if (done) scheduleOnRN(complete);
            },
          ),
        );
      }}
      onPressOut={() => {
        if (completed.current) return;
        progress.set(withTiming(0, { duration: 180 }));
      }}
      style={styles.cta}
    >
      <Animated.View pointerEvents="none" style={[styles.holdFill, fill]} />
      {busy ? (
        <ActivityIndicator color={theme.colors.primaryForeground} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** The quiet secondary action under a CTA. */
export function GhostButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghost,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(2),
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  holdFill: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: "left",
    backgroundColor: theme.colors.primaryForeground,
    opacity: 0.22,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    textAlign: "center",
    color: theme.colors.primaryForeground,
  },
  ghost: {
    minHeight: 44,
    paddingHorizontal: theme.gap(1),
    alignSelf: "center",
    justifyContent: "center",
  },
  ghostText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));

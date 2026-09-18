// Buttons. One ink pill per screen and no more: it is the thing you came to
// do. Everything else is a surface pill or a line of text.
//
// A button that is working says so by being stitched along: light stitches run
// the length of the pill while it waits, and a drawn tick closes it. Nothing
// spins.

import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { StitchLine } from "@/components/ink/stitch-line";
import { InkIcon } from "@/components/ink/ink-icon";

type ButtonState = "idle" | "pending" | "done" | "disabled";

export function PrimaryButton({
  label,
  /** Shown while `state` is pending: "Saving…". */
  pendingLabel,
  /** Shown when it lands: one word and a full stop, "Saved.". */
  doneLabel,
  state = "idle",
  onPress,
  style,
  testID,
}: {
  label: string;
  pendingLabel?: string;
  doneLabel?: string;
  state?: ButtonState;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const [width, setWidth] = useState(0);

  // The stitches loop while pending and stop the moment it is done.
  const stitch = useSharedValue(0);
  useEffect(() => {
    if (state !== "pending" || reduced) {
      stitch.value = 0;
      return;
    }
    stitch.value = 0;
    stitch.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [state, reduced, stitch]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.03 * pressed.value }],
    opacity: 1 - 0.12 * pressed.value,
  }));

  const text =
    state === "pending"
      ? (pendingLabel ?? label)
      : state === "done"
        ? (doneLabel ?? label)
        : label;

  return (
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        style={[
          styles.pill,
          styles.primary,
          state === "disabled" && styles.disabled,
        ]}
        disabled={state === "disabled" || state === "pending"}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 120 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 200 });
        }}
        onPress={onPress}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{
          disabled: state === "disabled",
          busy: state === "pending",
        }}
        testID={testID}
      >
        <Text style={styles.primaryLabel}>{text}</Text>
        {state === "pending" && width > 0 ? (
          <View style={styles.stitches} pointerEvents="none">
            <StitchLine width={width} light inset={22} />
          </View>
        ) : null}
        {state === "done" ? (
          <View style={styles.tick} pointerEvents="none">
            <InkIcon name="checkmark" size={16} tint="#fffdf8" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function SecondaryButton({
  label,
  small = false,
  onPress,
  disabled = false,
  leading,
  style,
  testID,
}: {
  label: string;
  small?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      style={[
        styles.pill,
        styles.secondary,
        small ? styles.secondarySmall : null,
        disabled && styles.disabled,
        style,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      {leading}
      <Text
        style={[styles.secondaryLabel, small && styles.secondaryLabelSmall]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A line of text that says what happens if you do nothing: "Keep them, next
 * batch". No chrome, but a full 44px row to press. */
export function TertiaryAction({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      style={styles.tertiary}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={styles.tertiaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    height: 54,
    borderRadius: 50,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primary: {
    backgroundColor: theme.colors.foreground,
    shadowColor: "#2b2418",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.ink.light,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondarySmall: { height: 40, paddingHorizontal: 18 },
  secondaryLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  secondaryLabelSmall: { fontSize: 14 },
  // Disabled dims rather than greys: the paper palette has no grey to go to.
  disabled: { opacity: 0.35 },
  tertiary: { height: 44, alignItems: "center", justifyContent: "center" },
  tertiaryLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
  stitches: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    alignItems: "center",
  },
  tick: { position: "absolute", right: 18 },
}));

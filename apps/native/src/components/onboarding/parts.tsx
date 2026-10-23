import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AppSymbolIcon } from "@/components/symbol";
import { StitchRow } from "@/components/ui/stitch-loader";
import { motion } from "@/lib/motion";
import * as Haptics from "expo-haptics";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A pressable that answers on touch-down: it shrinks to `motion.scale.pressed`
 * at once and springs back on release, from wherever it is. Under Reduce
 * Motion it dims instead.
 */
export function ScalePressable({
  style,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const down = useSharedValue(0);
  const animated = useAnimatedStyle(() =>
    reduced
      ? { opacity: 1 - down.value * (1 - theme.opacity.pressed) }
      : {
          transform: [{ scale: 1 - down.value * (1 - motion.scale.pressed) }],
        },
  );
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        down.value = withTiming(1, motion.timing.fade);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        down.value = reduced
          ? withTiming(0, motion.timing.fade)
          : withSpring(0, motion.spring.snap);
        onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
}

/** The ink pill a question screen ends on; grey until there is an answer. */
export function PillButton({
  label,
  onPress,
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const inactive = disabled || busy;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={[styles.pill, disabled && styles.pillDisabled]}
    >
      {busy ? (
        <StitchRow color={theme.colors.background} />
      ) : (
        <Text style={[styles.pillText, disabled && styles.pillTextDisabled]}>
          {label}
        </Text>
      )}
    </ScalePressable>
  );
}

export function QuestionTitle({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <View style={styles.question}>
      <Text
        style={styles.questionTitle}
        maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {body === undefined ? null : (
        <Text style={styles.questionBody}>{body}</Text>
      )}
    </View>
  );
}

/** An answer: emoji tile, title and subtitle, and a round mark that fills when picked. */
export function OptionCard({
  emoji,
  title,
  subtitle,
  selected,
  multi,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <ScalePressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={() => {
        // Same frame as the mark filling in.
        if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={styles.emojiTile}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.optionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={[styles.mark, selected && styles.markOn]}>
        {selected ? (
          <AppSymbolIcon
            name="checkmark"
            size={12}
            weight="bold"
            tintColor={theme.colors.onTint}
          />
        ) : null}
      </View>
    </ScalePressable>
  );
}

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
        <StitchRow color={theme.colors.primaryForeground} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </Pressable>
  );
}

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
  pill: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: theme.gap(3),
    backgroundColor: theme.colors.foreground,
  },
  pillDisabled: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  pillText: {
    ...theme.type.headline,
    textAlign: "center",
    color: theme.colors.background,
  },
  pillTextDisabled: {
    color: theme.colors.muted,
  },
  question: {
    gap: theme.gap(1),
  },
  questionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    lineHeight: 34,
    // About -0.02em: large type tracks tighter.
    letterSpacing: -0.6,
    color: theme.colors.foreground,
  },
  questionBody: {
    ...theme.type.subhead,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  option: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
  },
  // Grows with Dynamic Type rather than clipping the emoji.
  emojiTile: {
    minWidth: 44,
    minHeight: 44,
    padding: theme.gap(0.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  emoji: {
    fontSize: 22,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    ...theme.type.headline,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  optionSubtitle: {
    ...theme.type.caption,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  markOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(2),
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
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

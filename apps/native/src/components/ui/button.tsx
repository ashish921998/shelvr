import { useState } from "react";
import { View } from "react-native";
import { Pressable, type PressableProps } from "react-native-gesture-handler";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GlassView, hasLiquidGlass } from "@/components/glass";
import { motion, motionCSS } from "@/lib/motion";
import { ThemedText } from "@/components/ui/themed-text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Visual = "idle" | "pressed" | "disabled" | "loading";

type Props = Omit<PressableProps, "children" | "style"> & {
  title: string;
  loading?: boolean;
  style?: React.ComponentProps<typeof AnimatedPressable>["style"];
};

/**
 * Shelvr's capsule action for a screen's main step. Where iOS supports Liquid
 * Glass it is interactive glass and the system owns the press response;
 * elsewhere it is a solid capsule that dims and scales in. Loading dims the
 * button instead of swapping in a spinner, so the label stays put and nothing
 * around it reflows. Ported from Amber (#13).
 */
export function Button({
  title,
  loading = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  accessibilityState,
  ...props
}: Props) {
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || loading;
  // Glass animates its own press natively, so only the solid capsule tracks it.
  const visual: Visual = loading
    ? "loading"
    : inactive
      ? "disabled"
      : pressed && !hasLiquidGlass
        ? "pressed"
        : "idle";
  const opacity: Record<Visual, number> = {
    idle: 1,
    pressed: theme.opacity.pressed,
    loading: theme.opacity.pressed,
    disabled: theme.opacity.disabled,
  };
  const scale =
    visual === "pressed" && !reducedMotion ? motion.scale.pressed : 1;
  const label = (
    <ThemedText variant="button" style={styles.label}>
      {title}
    </ThemedText>
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        ...accessibilityState,
        disabled: inactive,
        busy: loading,
      }}
      pressRetentionOffset={theme.control.pressRetentionOffset}
      {...props}
      disabled={inactive}
      onPressIn={(event) => {
        if (!hasLiquidGlass) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!hasLiquidGlass) setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        {
          opacity: opacity[visual],
          transform: [{ scale }],
          transitionProperty: ["opacity", "transform"],
          transitionDuration: motion.duration.feedback,
          transitionTimingFunction: motionCSS.out,
        },
        style,
      ]}
    >
      {hasLiquidGlass ? (
        <GlassView
          testID="button-glass"
          glassEffectStyle="regular"
          isInteractive={!inactive}
          tintColor={theme.colors.primary}
          style={styles.surface}
        >
          {label}
        </GlassView>
      ) : (
        <View testID="button-solid" style={[styles.surface, styles.filled]}>
          {label}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  surface: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(3),
    paddingVertical: theme.gap(1.5),
    borderRadius: 999,
    overflow: "hidden",
  },
  filled: { backgroundColor: theme.colors.primary },
  label: { flexShrink: 1, textAlign: "center", color: theme.colors.onTint },
}));

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, motionCSS } from "@/lib/motion";
import { ThemedText } from "./themed-text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "children" | "style"> & {
  title: string;
  loading?: boolean;
  style?: React.ComponentProps<typeof AnimatedPressable>["style"];
};

/** Primary action. The label stays mounted and visible beside the spinner. */
export function Button({
  title,
  loading = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const inactive = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      pressRetentionOffset={theme.control.pressRetentionOffset}
      {...props}
      disabled={inactive}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        styles.button,
        {
          opacity: inactive
            ? theme.opacity.disabled
            : pressed
              ? theme.opacity.pressed
              : 1,
          transform: [
            {
              scale:
                pressed && !inactive && !reducedMotion
                  ? motion.scale.pressed
                  : 1,
            },
          ],
          transitionProperty: ["opacity", "transform"],
          transitionDuration: motion.duration.feedback,
          transitionTimingFunction: motionCSS.out,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={theme.colors.onTint} /> : null}
        <ThemedText variant="button" style={styles.label}>
          {title}
        </ThemedText>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  label: { color: theme.colors.onTint, textAlign: "center" },
}));

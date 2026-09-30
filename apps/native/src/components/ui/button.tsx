import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, motionCSS } from "@/lib/motion";
import { ThemedText } from "@/components/ui/themed-text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const glass = isLiquidGlassAvailable();

type Variant = "primary" | "secondary" | "destructive";
type Size = "md" | "lg";

type Props = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  style?: React.ComponentProps<typeof AnimatedPressable>["style"];
};

/**
 * Shelvr's capsule action. Where iOS supports Liquid Glass it is interactive
 * glass and the system owns the press response; elsewhere it is a solid fill
 * that dims and scales in. Loading dims the button instead of swapping in a
 * spinner, so the label stays put and nothing around the button reflows.
 * Ported from Amber (#13).
 */
export function Button({
  title,
  variant = "primary",
  size = "md",
  icon,
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
  const inactive = disabled || loading;
  // Glass animates its own press natively; the solid fallback mimics it in JS.
  const held = loading || (!glass && pressed && !inactive);
  const filled = variant === "primary";
  const labelColor = filled
    ? theme.colors.onTint
    : variant === "destructive"
      ? theme.colors.danger
      : theme.colors.foreground;
  const content = (
    <>
      {icon}
      <ThemedText
        variant="button"
        style={[styles.label, { color: labelColor }]}
      >
        {title}
      </ThemedText>
    </>
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        ...accessibilityState,
        disabled: !!inactive,
        busy: loading,
      }}
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
        {
          opacity: held
            ? theme.opacity.pressed
            : inactive
              ? theme.opacity.disabled
              : 1,
          transform: [
            {
              scale:
                held && !glass && !reducedMotion ? motion.scale.pressed : 1,
            },
          ],
          transitionProperty: ["opacity", "transform"],
          transitionDuration: motion.duration.feedback,
          transitionTimingFunction: motionCSS.out,
        },
        style,
      ]}
    >
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive={!inactive}
          tintColor={filled ? theme.colors.primary : undefined}
          style={[styles.surface, styles[size]]}
        >
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            styles.surface,
            styles[size],
            filled
              ? { backgroundColor: theme.colors.primary }
              : {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                },
          ]}
        >
          {content}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  surface: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(3),
    borderRadius: 999,
    overflow: "hidden",
  },
  md: { minHeight: theme.control.minHeight, paddingVertical: theme.gap(1.5) },
  lg: { minHeight: 56, paddingVertical: theme.gap(2) },
  label: { flexShrink: 1, textAlign: "center" },
}));

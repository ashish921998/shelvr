// The confirmation. One word and a full stop on the left, what happened to it
// on the right, and a stitch drawn underneath to close the moment. It rises
// 12px, stays 2.5s, and goes.

import { useEffect } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { StitchLine } from "@/components/ink/stitch-line";
import { INK_A11Y } from "@/components/ink/ink-canvas";

const TOAST_MS = 2500;

export function ShelfToast({
  /** "Saved." — one word, a full stop. */
  verdict,
  /** "Onto Recipes" — where it went. */
  detail,
  visible,
  onHidden,
}: {
  verdict: string;
  detail?: string;
  visible: boolean;
  onHidden?: () => void;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(0);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!visible) {
      shown.value = withTiming(0, { duration: 200 });
      return;
    }
    shown.value = withTiming(1, {
      duration: reduced ? 0 : 300,
      easing: Easing.out(Easing.cubic),
    });
    const timer = setTimeout(() => onHidden?.(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [visible, reduced, shown, onHidden]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 12 }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.wrap, style]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.panel}>
        <View style={styles.line}>
          <Text style={styles.verdict}>{verdict}</Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
        <View style={styles.stitch} {...INK_A11Y}>
          <StitchLine width={Math.min(width - 80, 300)} inset={0} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Clear of the floating pill.
  wrap: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 104,
    alignItems: "center",
  },
  panel: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: "#2b2418",
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  verdict: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.foreground,
  },
  detail: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  stitch: { alignItems: "center", marginTop: 2 },
}));

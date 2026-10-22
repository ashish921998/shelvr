import { AppSymbolIcon } from "@/components/symbol";
import { motion } from "@/lib/motion";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BADGE = 72;
const SETTLE_MS = 1400;

export function CelebrationBadge() {
  const { theme } = useUnistyles();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: SETTLE_MS,
      easing: motion.easing.out,
      reduceMotion: ReduceMotion.System,
    });
  }, [progress]);

  const badge = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value * 2);
    return { opacity: p, transform: [{ scale: 0.94 + 0.06 * p }] };
  });
  const ring = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - progress.value),
    transform: [{ scale: 1 + 0.45 * progress.value }],
  }));

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.ring, ring]} />
      <Animated.View style={[styles.badge, badge]}>
        <AppSymbolIcon
          name="checkmark"
          size={28}
          tintColor={theme.colors.primaryText}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    width: BADGE,
    height: BADGE,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  ring: {
    position: "absolute",
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
}));

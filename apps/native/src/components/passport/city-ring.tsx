import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { motion } from "@/lib/motion";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type RingCount = { stamped: number; total: number };

export function ringShare({ stamped, total }: RingCount): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, stamped / total));
}

export function ringComplete(count: RingCount): boolean {
  return count.total > 0 && count.stamped >= count.total;
}

export function cityRingLabel(
  { stamped, total }: RingCount,
  city: string,
  locked = false,
): string {
  return locked
    ? t("passport.ringLocked", { count: total, city })
    : t("passport.ringLabel", {
        count: total,
        visited: Math.min(stamped, total),
        city,
      });
}

function useRingFill(share: number) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? share : 0);
  useEffect(() => {
    if (reduced) fill.set(share);
    else fill.set(withTiming(share, motion.timing.enter));
  }, [fill, reduced, share]);
  const right = useAnimatedStyle(() => {
    const turn = Math.min(fill.get(), 0.5);
    return {
      opacity: turn > 0 ? 1 : 0,
      transform: [{ rotate: `${45 + turn * 360}deg` }],
    };
  });
  const left = useAnimatedStyle(() => {
    const turn = Math.max(fill.get() - 0.5, 0);
    return {
      opacity: turn > 0 ? 1 : 0,
      transform: [{ rotate: `${45 + turn * 360}deg` }],
    };
  });
  return { left, right };
}

function RingFill({ share, size }: { share: number; size: number }) {
  const { left, right } = useRingFill(share);
  const half = size / 2;
  const stroke = ringStroke(size);
  const disc = { width: size, height: size, borderRadius: half };
  return (
    <>
      <View style={[styles.track, disc, { borderWidth: stroke }]} />
      <View style={[styles.clip, { left: half, width: half, height: size }]}>
        <Animated.View
          testID="city-ring-right"
          style={[
            styles.rotor,
            styles.leftHalf,
            disc,
            { left: -half, borderWidth: stroke },
            right,
          ]}
        />
      </View>
      <View style={[styles.clip, { left: 0, width: half, height: size }]}>
        <Animated.View
          testID="city-ring-left"
          style={[
            styles.rotor,
            styles.rightHalf,
            disc,
            { left: 0, borderWidth: stroke },
            left,
          ]}
        />
      </View>
    </>
  );
}

function ringStroke(size: number): number {
  return Math.max(3, Math.round(size / 9));
}

export function CityRing({
  stamped,
  total,
  city,
  size = 40,
  locked = false,
}: RingCount & { city: string; size?: number; locked?: boolean }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const count = { stamped, total };
  const complete = !locked && ringComplete(count);
  const icon = Math.round(size * 0.42);
  return (
    <View
      testID="city-ring"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={cityRingLabel(count, city, locked)}
      accessibilityValue={
        locked
          ? undefined
          : { min: 0, max: total, now: Math.min(stamped, total) }
      }
      style={[styles.ring, { width: size, height: size }]}
    >
      {complete ? (
        <View
          testID="city-ring-complete"
          style={[
            styles.done,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <AppSymbolIcon
            name="checkmark"
            size={icon}
            weight="bold"
            tintColor={theme.colors.onKeep}
          />
        </View>
      ) : locked ? (
        <>
          <View
            style={[
              styles.track,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: ringStroke(size),
              },
            ]}
          />
          <AppSymbolIcon
            name="lock"
            size={icon}
            tintColor={theme.colors.muted}
          />
        </>
      ) : (
        <RingFill share={ringShare(count)} size={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  ring: { alignItems: "center", justifyContent: "center" },
  track: {
    position: "absolute",
    top: 0,
    left: 0,
    borderColor: theme.colors.surfaceMuted,
  },
  clip: { position: "absolute", top: 0, overflow: "hidden" },
  rotor: { position: "absolute", top: 0, borderColor: "transparent" },
  leftHalf: {
    borderLeftColor: theme.colors.keep,
    borderBottomColor: theme.colors.keep,
  },
  rightHalf: {
    borderTopColor: theme.colors.keep,
    borderRightColor: theme.colors.keep,
  },
  done: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.keep,
  },
}));

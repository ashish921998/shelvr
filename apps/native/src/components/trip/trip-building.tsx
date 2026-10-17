import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { dayColor } from "@/lib/trip";
import type { TextMessageKey } from "@/locales/message-types";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

// A route drawing itself across a little map: five stops, each popping in
// as the line reaches it, while the steps below say what Shelvr is doing.
const STOPS = [
  { x: 18, y: 78 },
  { x: 82, y: 30 },
  { x: 142, y: 70 },
  { x: 200, y: 22 },
  { x: 250, y: 64 },
];
const DOT = 22;
const STEP_MS = 1800;
const STEPS: TextMessageKey[] = [
  "trip.buildingRead",
  "trip.buildingFind",
  "trip.buildingGroup",
];

function Segment({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const from = STOPS[index];
  const to = STOPS[index + 1];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${angle}rad` },
      {
        scaleX: interpolate(
          progress.value,
          [index + 0.35, index + 1],
          [0, 1],
          "clamp",
        ),
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.segment,
        {
          left: from.x + DOT / 2,
          top: from.y + DOT / 2 - 1,
          width: length,
          backgroundColor: dayColor(0),
        },
        style,
      ]}
    />
  );
}

function Dot({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const at = interpolate(
      progress.value,
      [index, index + 0.35],
      [0, 1],
      "clamp",
    );
    // A small overshoot, so each stop lands like a dropped pin.
    const pop = at < 1 ? Easing.back(2.2)(at) : 1;
    return { opacity: at, transform: [{ scale: pop }] };
  });
  return (
    <Animated.View
      style={[
        styles.dot,
        { left: STOPS[index].x, top: STOPS[index].y },
        { backgroundColor: dayColor(index < 3 ? 0 : 1) },
        style,
      ]}
    >
      <ThemedText variant="captionStrong" style={styles.dotLabel}>
        {index + 1}
      </ThemedText>
    </Animated.View>
  );
}

/** Covers of the space's saves, drifting gently over the route. */
function Covers({ covers }: { covers: string[] }) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    bob.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [bob, reduced]);
  const styleA = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * bob.value }, { rotate: "-8deg" }],
  }));
  const styleB = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * (1 - bob.value) }],
  }));
  const styleC = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * bob.value }, { rotate: "8deg" }],
  }));
  const styled = [styleA, styleB, styleC];
  return (
    <View style={styles.covers}>
      {covers.slice(0, 3).map((uri, i) => (
        <Animated.View
          key={uri}
          entering={FadeIn.delay(i * 120).duration(300)}
          style={[styles.cover, styles.coverAt(i), styled[i]]}
        >
          <Image source={{ uri }} style={styles.fill} contentFit="cover" />
        </Animated.View>
      ))}
    </View>
  );
}

/** What the trip screen shows while the trip is being made. */
export function TripBuilding({ covers }: { covers: string[] }) {
  useAppLocale();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? STOPS.length : 0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    progress.set(
      withRepeat(
        withSequence(
          withTiming(STOPS.length, {
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(STOPS.length, { duration: 500 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [progress, reduced]);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      STEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.wrap}>
      {covers.length > 0 ? <Covers covers={covers} /> : null}
      <View style={styles.route}>
        {STOPS.slice(0, -1).map((_, i) => (
          <Segment key={i} index={i} progress={progress} />
        ))}
        {STOPS.map((_, i) => (
          <Dot key={i} index={i} progress={progress} />
        ))}
      </View>
      <View style={styles.stepLine} accessibilityLiveRegion="polite">
        <Animated.View
          key={step}
          entering={FadeIn.duration(260)}
          exiting={FadeOut.duration(180)}
          style={styles.stepText}
        >
          <ThemedText variant="subheadLabel" style={styles.muted}>
            {t(STEPS[step])}
          </ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    alignItems: "center",
    gap: theme.gap(2),
    paddingVertical: theme.gap(2),
  },
  covers: {
    width: theme.gap(24),
    height: theme.gap(13),
    alignItems: "center",
    justifyContent: "center",
  },
  cover: {
    position: "absolute",
    width: theme.gap(8),
    height: theme.gap(11),
    borderRadius: theme.radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.surfaceMuted,
  },
  coverAt: (index: number) => ({
    left: theme.gap(2.5) + index * theme.gap(5.5),
    zIndex: index === 1 ? 2 : 1,
  }),
  fill: {
    width: "100%",
    height: "100%",
  },
  route: {
    width: 272,
    height: 104,
  },
  segment: {
    position: "absolute",
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
    transformOrigin: "left",
  },
  dot: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  dotLabel: {
    color: theme.colors.onTint,
  },
  stepLine: {
    height: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  stepText: {
    position: "absolute",
  },
  muted: {
    color: theme.colors.muted,
  },
}));

import { Image } from "expo-image";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { phase, track, useLoop } from "../loop";

/*
 * Slide 2: a receipt and two photos tossed onto the shelf. `shToss`, a 5 s
 * loop staggered 0 / 0.5 / 1.0 s: in from below by 16 %, held to 82 %, out
 * with an 8pt lift by 94 %.
 */

const TEE = require("../../../../assets/onboarding/tee.jpg");
const ESPRESSO = require("../../../../assets/onboarding/espresso.jpg");

const LOOP_MS = 5000;
// The design's card is 362 × 380; positions are kept relative to that.
const DESIGN_WIDTH = 362;
const DESIGN_HEIGHT = 380;

const CARDS = [
  { left: 26, top: 96, rest: -9, enter: -28, delay: 0 },
  { left: 118, top: 84, rest: 5, enter: 22, delay: 0.1 },
  { left: 210, top: 104, rest: 13, enter: -18, delay: 0.2 },
] as const;

function useTossStyle(
  progress: SharedValue<number>,
  card: (typeof CARDS)[number],
) {
  return useAnimatedStyle(() => {
    const p = phase(progress.value, -card.delay);
    return {
      opacity: track(p, [0, 0.16, 0.82, 0.94], [0, 1, 1, 0]),
      transform: [
        { translateY: track(p, [0, 0.16, 0.82, 0.94], [170, 0, 0, -8]) },
        {
          rotate: `${track(p, [0, 0.16], [card.enter, card.rest])}deg`,
        },
      ],
    };
  });
}

export function ShotsSlide({
  animate,
  height,
}: {
  animate: boolean;
  height: number;
}) {
  const progress = useLoop(LOOP_MS, animate, 0.5);
  const width = useWindowDimensions().width - 40;
  const dx = (width - DESIGN_WIDTH) / 2;
  const dy = height - DESIGN_HEIGHT;
  const styleA = useTossStyle(progress, CARDS[0]);
  const styleB = useTossStyle(progress, CARDS[1]);
  const styleC = useTossStyle(progress, CARDS[2]);
  const at = (index: number) => ({
    left: CARDS[index].left + dx,
    top: Math.max(0, CARDS[index].top + dy),
  });

  return (
    <View style={styles.fill}>
      <View style={styles.shelf} />
      <Animated.View style={[styles.card, styles.receipt, at(0), styleA]}>
        <View style={styles.bar(7, 46, 0.75)} />
        <View style={[styles.bar(5, 62, 0.18), styles.gap]} />
        <View style={[styles.bar(5, 54, 0.18), styles.gap]} />
        <View style={[styles.bar(5, 60, 0.18), styles.gap]} />
        <View style={styles.rule} />
        <View style={styles.totals}>
          <View style={styles.bar(6, 26, 0.5)} />
          <View style={styles.bar(6, 22, 0.75)} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.card, at(1), styleB]}>
        <Image source={TEE} style={styles.photo} contentFit="cover" />
      </Animated.View>
      <Animated.View style={[styles.card, at(2), styleC]}>
        <Image source={ESPRESSO} style={styles.photo} contentFit="cover" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  shelf: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: theme.colors.surfaceMuted,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
  },
  card: {
    position: "absolute",
    width: 124,
    height: 166,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
    shadowColor: theme.colors.primaryForeground,
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  receipt: { paddingVertical: 10, paddingHorizontal: 9 },
  photo: { width: "100%", height: "100%" },
  bar: (height: number, width: number, opacity: number) => ({
    height,
    width,
    borderRadius: 2,
    backgroundColor: theme.colors.foreground,
    opacity,
  }),
  gap: { marginTop: 8 },
  rule: {
    marginTop: 12,
    height: 1,
    backgroundColor: theme.colors.foreground,
    opacity: 0.12,
  },
  totals: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
}));

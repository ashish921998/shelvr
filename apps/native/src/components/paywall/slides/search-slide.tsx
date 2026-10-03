import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { track, useLoop } from "../loop";

/*
 * Slide 4: a query types itself, the grid dims to what matches, and the
 * matches get a ring. 5 s loop: typing 18–48 % (one step per character),
 * dim and ring 44–56 %, restored 88–100 %. The caret blinks at 1 Hz.
 */

const LOOP_MS = 5000;
const TILES = [
  { source: require("../../../../assets/onboarding/ramen.jpg"), match: true },
  { source: require("../../../../assets/onboarding/sofa.jpg"), match: false },
  { source: require("../../../../assets/onboarding/diner.jpg"), match: true },
  { source: require("../../../../assets/onboarding/recipes.jpg"), match: true },
  { source: require("../../../../assets/onboarding/book.jpg"), match: false },
  {
    source: require("../../../../assets/onboarding/reading.jpg"),
    match: false,
  },
];

function useTileStyles(progress: SharedValue<number>, match: boolean) {
  const tile = useAnimatedStyle(() => ({
    opacity: match
      ? 1
      : track(progress.value, [0.44, 0.56, 0.88, 1], [1, 0.18, 0.18, 1]),
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: match
      ? track(progress.value, [0.44, 0.56, 0.88, 1], [0, 1, 1, 0])
      : 0,
  }));
  return { tile, ring };
}

export function SearchSlide({
  animate,
  compact,
}: {
  animate: boolean;
  compact: boolean;
}) {
  const { theme } = useUnistyles();
  const query = t("paywall.demoSearch");
  const chars = Array.from(query);
  const progress = useLoop(LOOP_MS, animate, 0.6);
  const caretClock = useLoop(1000, animate, 0);
  const [typed, setTyped] = useState(animate ? 0 : chars.length);
  const count = chars.length;
  useAnimatedReaction(
    () =>
      Math.min(
        count,
        Math.floor(track(progress.value, [0.18, 0.48], [0, count + 0.999])),
      ),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setTyped, next);
    },
    [count],
  );
  const caret = useAnimatedStyle(() => ({
    opacity: caretClock.value < 0.5 ? 1 : 0,
  }));
  const styleSets = [
    useTileStyles(progress, TILES[0].match),
    useTileStyles(progress, TILES[1].match),
    useTileStyles(progress, TILES[2].match),
    useTileStyles(progress, TILES[3].match),
    useTileStyles(progress, TILES[4].match),
    useTileStyles(progress, TILES[5].match),
  ];
  const shown = compact ? TILES.slice(0, 3) : TILES;

  return (
    <View style={styles.column}>
      <View style={styles.field}>
        <AppSymbolIcon
          name="magnifyingglass"
          size={18}
          tintColor={theme.colors.muted}
        />
        <Text style={styles.query}>{chars.slice(0, typed).join("")}</Text>
        <Animated.View style={[styles.caret, caret]} />
      </View>
      <View style={styles.grid}>
        {shown.map((tile, index) => (
          <Animated.View
            key={index}
            style={[styles.tile, styleSets[index].tile]}
          >
            <Image
              source={tile.source}
              style={styles.image}
              contentFit="cover"
            />
            <Animated.View style={[styles.ring, styleSets[index].ring]} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  column: { flex: 1, padding: 20, gap: 18 },
  field: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 50,
    paddingHorizontal: 14,
  },
  query: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  caret: {
    marginLeft: -6,
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: theme.colors.primary,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "31%",
    flexGrow: 1,
    aspectRatio: 5 / 6,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
  },
  image: { width: "100%", height: "100%" },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.sm,
    borderWidth: 2.5,
    borderColor: theme.colors.primary,
  },
}));

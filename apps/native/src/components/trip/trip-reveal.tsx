import { ThemedText } from "@/components/ui/themed-text";
import { useBuildStep } from "@/components/trip/trip-building";
import { t, useAppLocale } from "@/lib/i18n";
import {
  GLOBE_CITY,
  GLOBE_SIZE,
  REVEAL_TIMING,
  revealCovers,
  revealLayout,
  type RevealCard,
  type RevealCover,
} from "@/lib/trip-reveal";
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Oval,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Stage = "lift" | "dots" | "wait" | "dive";

// iOS springs, as SwiftUI's .spring(response, dampingFraction). The app
// checks Reduce Motion before it plays the reveal, so these never defer to it.
const NEVER = ReduceMotion.Never;
const SPRING = {
  lift: { duration: 450, dampingRatio: 0.72, reduceMotion: NEVER },
  fly: { duration: 800, dampingRatio: 1, reduceMotion: NEVER },
  pop: { duration: 350, dampingRatio: 0.6, reduceMotion: NEVER },
  camera: { duration: 1100, dampingRatio: 1, reduceMotion: NEVER },
};
const fade = (duration: number) => ({ duration, reduceMotion: NEVER });

/** Land shapes on the globe drawing, in its 500 x 500 box. */
const LAND = [
  "M95 140 q70 -45 140 -12 q55 30 45 90 q-30 45 -100 34 q-70 -12 -90 -60z",
  "M150 300 q40 -10 60 20 q10 40 -20 70 q-30 10 -45 -20z",
];
const CITY_LAND =
  "M318 150 q16 -14 24 8 q6 28 -10 52 q-12 14 -20 26 q-8 4 -6 -10 q10 -26 12 -48 q2 -16 0 -28z";

/** Whether Trip Reveal is playing, and what it shows. `start` begins it when
 * it can play (there are covers and Reduce Motion is off) and says whether it
 * did; Reduce Motion gets the plain building panel instead. The save count is
 * taken at Build, so a save landing mid-reveal never restarts the count. */
export function useTripReveal(
  space: { items: Parameters<typeof revealCovers>[0] } | null | undefined,
  cities: { city: string }[] | undefined,
  request: { city?: string } | null,
  built: boolean,
) {
  // The save count while the reveal plays, null when it is not playing.
  const [count, setCount] = useState<number | null>(null);
  // Set when a reveal starts, so skipping it before the trip arrives keeps
  // the old trip's map down: it would otherwise drop its pins, then drop
  // the new trip's again.
  const [held, setHeld] = useState(false);
  const reducedMotion = useReducedMotion();
  const city =
    request?.city ?? (cities?.length === 1 ? cities[0].city : undefined);
  const items = space?.items;
  const covers = useMemo(() => revealCovers(items ?? [], city), [items, city]);
  const playable = !reducedMotion && covers.length > 0;
  const start = useCallback(
    (saves: number) => {
      setCount(playable ? saves : null);
      setHeld(playable);
      return playable;
    },
    [playable],
  );
  const end = useCallback(() => setCount(null), []);
  // The build failed: the message replaces the reveal over the old map.
  const cancel = useCallback(() => {
    setCount(null);
    setHeld(false);
  }, []);
  return {
    revealing: count !== null,
    count: count ?? 0,
    hidesMap: count !== null || (held && !built),
    covers,
    city,
    start,
    end,
    cancel,
  };
}

/**
 * Trip Reveal: plays over the trip screen while the trip is built. The saves
 * lift off, turn into dots and fall onto a globe; once the trip has arrived
 * the globe dives into the city and `onDone` hands over to the map. Tapping
 * skips it.
 */
export function TripReveal({
  covers,
  count,
  city,
  ready,
  onDone,
}: {
  covers: RevealCover[];
  count: number;
  city?: string;
  /** The trip has arrived, so the globe may dive. */
  ready: boolean;
  onDone: () => void;
}) {
  useAppLocale();
  const { rt } = useUnistyles();
  const layout = useMemo(
    () => revealLayout(rt.screen.width, rt.screen.height, covers.length),
    [rt.screen.width, rt.screen.height, covers.length],
  );
  const [phase, setPhase] = useState<Exclude<Stage, "dive">>("lift");
  const stage: Stage = phase === "wait" && ready ? "dive" : phase;
  const [rolled, setRolled] = useState(0);

  useEffect(() => {
    const dots = setTimeout(() => setPhase("dots"), REVEAL_TIMING.dots);
    const wait = setTimeout(() => setPhase("wait"), REVEAL_TIMING.wait);
    return () => {
      clearTimeout(dots);
      clearTimeout(wait);
    };
  }, []);

  useEffect(() => {
    if (stage !== "dive") return;
    const started = Date.now();
    const roll = setInterval(() => {
      const share = Math.min(1, (Date.now() - started) / REVEAL_TIMING.roll);
      setRolled(Math.round(share * count));
      if (share >= 1) clearInterval(roll);
    }, 40);
    const landed = setTimeout(() => {
      if (process.env.EXPO_OS === "ios") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, REVEAL_TIMING.landed);
    const done = setTimeout(onDone, REVEAL_TIMING.done);
    return () => {
      clearInterval(roll);
      clearTimeout(landed);
      clearTimeout(done);
    };
  }, [stage, count, onDone]);

  return (
    <Animated.View
      entering={FadeIn.duration(600)}
      exiting={FadeOut.duration(300)}
      style={styles.screen}
    >
      <Globe stage={stage} globe={layout.globe} />
      {covers.map((cover, index) => (
        <Card
          key={cover.id}
          cover={cover}
          card={layout.cards[index]}
          stage={stage}
        />
      ))}
      {layout.dots.map((dot, index) => (
        <Dot
          key={`${dot.x}:${dot.y}`}
          index={index}
          dot={dot}
          landing={layout.landing}
          stage={stage}
        />
      ))}
      <View style={styles.caption} pointerEvents="none">
        {stage === "dive" ? (
          <Animated.View
            key="count"
            entering={FadeIn.duration(250)}
            style={styles.count}
          >
            <ThemedText variant="hero" style={styles.number}>
              {t("trip.revealSaves", { count: rolled })}
            </ThemedText>
            <ThemedText variant="subhead" style={styles.muted}>
              {city
                ? t("trip.revealLanding", { city })
                : t("trip.revealLandingNoCity")}
            </ThemedText>
          </Animated.View>
        ) : stage === "wait" ? (
          <Animated.View
            key="step"
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(150)}
          >
            <BuildStep />
          </Animated.View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("trip.revealSkip")}
        onPress={onDone}
        style={styles.skip}
      >
        <Animated.View entering={FadeIn.delay(1000).duration(300)}>
          <ThemedText variant="caption" style={styles.muted}>
            {t("trip.revealSkip")}
          </ThemedText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function BuildStep() {
  const step = useBuildStep();
  return (
    <ThemedText
      variant="subheadLabel"
      style={styles.muted}
      accessibilityLiveRegion="polite"
    >
      {t(step)}
    </ThemedText>
  );
}

/** One save: lifts off the screen, then shrinks into its dot. */
function Card({
  cover,
  card,
  stage,
}: {
  cover: RevealCover;
  card: RevealCard;
  stage: Stage;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(40);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0.96);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = card.rank * REVEAL_TIMING.stagger;
    if (stage === "lift") {
      opacity.value = withDelay(delay, withTiming(1, fade(200)));
      x.value = withDelay(delay, withSpring(card.dx, SPRING.lift));
      y.value = withDelay(delay, withSpring(-36, SPRING.lift));
      rotate.value = withDelay(delay, withSpring(card.rotate, SPRING.lift));
      scale.value = withDelay(delay, withSpring(0.92, SPRING.lift));
    } else if (stage === "dots") {
      x.value = withDelay(delay, withSpring(card.toX, SPRING.fly));
      y.value = withDelay(delay, withSpring(card.toY, SPRING.fly));
      rotate.value = withDelay(delay, withSpring(card.rotate * 3, SPRING.fly));
      scale.value = withDelay(delay, withSpring(0.1, SPRING.fly));
      opacity.value = withDelay(300 + delay, withTiming(0, fade(500)));
    }
  }, [stage, card, x, y, rotate, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          left: card.left,
          top: card.top,
          width: card.width,
          height: card.height,
        },
        style,
      ]}
    >
      <View style={styles.cardFace}>
        <Image
          source={{ uri: cover.imageUrl }}
          contentFit="cover"
          style={styles.cover}
          accessibilityIgnoresInvertColors
        />
        <ThemedText
          variant="subheadLabel"
          numberOfLines={2}
          style={styles.title}
        >
          {cover.title}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

/** A glowing dot: pops in where a save shrank, breathes while the trip is
 * built, then falls onto the city. */
function Dot({
  index,
  dot,
  landing,
  stage,
}: {
  index: number;
  dot: { x: number; y: number };
  landing: { x: number; y: number };
  stage: Stage;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (stage === "dots") {
      const delay = 500 + index * 30;
      opacity.value = withDelay(delay, withTiming(1, fade(150)));
      scale.value = withDelay(delay, withSpring(1, SPRING.pop));
    } else if (stage === "wait") {
      scale.value = withRepeat(
        withSequence(withTiming(1.3, fade(700)), withTiming(1, fade(700))),
        -1,
      );
    } else if (stage === "dive") {
      const delay = index * 25;
      opacity.value = withTiming(1, fade(150));
      x.value = withDelay(delay, withSpring(landing.x - dot.x, SPRING.camera));
      y.value = withDelay(delay, withSpring(landing.y - dot.y, SPRING.camera));
      scale.value = withDelay(delay, withSpring(0.6, SPRING.camera));
    }
  }, [stage, index, dot, landing, x, y, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { left: dot.x - 5, top: dot.y - 5 }, style]}
    />
  );
}

/** The globe: rises as the saves become dots, then dives into the city. */
function Globe({
  stage,
  globe,
}: {
  stage: Stage;
  globe: ReturnType<typeof revealLayout>["globe"];
}) {
  const { theme } = useUnistyles();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (stage === "dots") {
      y.value = withSpring(globe.rise, SPRING.camera);
    } else if (stage === "dive") {
      x.value = withSpring(globe.diveX, SPRING.camera);
      y.value = withSpring(globe.diveY, SPRING.camera);
      scale.value = withSpring(3, SPRING.camera);
      glow.value = withDelay(800, withTiming(0.85, fade(500)));
    }
  }, [stage, globe, x, y, scale, glow]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  // Parsed on render, not at module load, so a bundle without Skia can still
  // import this file.
  const land = useMemo(
    () =>
      LAND.map((d) => Skia.Path.MakeFromSVGString(d)).filter(
        (path) => path !== null,
      ),
    [],
  );
  const cityLand = useMemo(() => Skia.Path.MakeFromSVGString(CITY_LAND), []);
  const r = GLOBE_SIZE / 2 - 20;
  const c = GLOBE_SIZE / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.globe,
        {
          left: globe.left,
          top: globe.top,
          transformOrigin: [GLOBE_CITY.x, GLOBE_CITY.y, 0],
        },
        style,
      ]}
    >
      <Canvas style={styles.globeCanvas}>
        <Circle cx={c} cy={c} r={r} color={theme.colors.primarySoft} />
        <Circle
          cx={c}
          cy={c}
          r={r}
          color={theme.colors.border}
          style="stroke"
          strokeWidth={1.5}
        />
        {[
          [r, 80],
          [120, r],
          [r, 160],
        ].map(([rx, ry]) => (
          <Oval
            key={`${rx}:${ry}`}
            x={c - rx}
            y={c - ry}
            width={rx * 2}
            height={ry * 2}
            color={theme.colors.border}
            style="stroke"
            strokeWidth={1}
          />
        ))}
        {land.map((path, index) => (
          <Path
            key={index}
            path={path}
            color={theme.colors.primary}
            opacity={0.16}
          />
        ))}
        {cityLand ? (
          <Path path={cityLand} color={theme.colors.primary} opacity={0.6} />
        ) : null}
        <Group opacity={glow}>
          <Circle
            cx={GLOBE_CITY.x}
            cy={GLOBE_CITY.y}
            r={26}
            color={theme.colors.primary}
          >
            <BlurMask blur={6} style="normal" />
          </Circle>
          <Circle
            cx={GLOBE_CITY.x}
            cy={GLOBE_CITY.y}
            r={3}
            color={theme.colors.primaryText}
          />
        </Group>
      </Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: "hidden",
  },
  card: {
    position: "absolute",
    padding: 4,
    zIndex: 3,
  },
  cardFace: {
    flex: 1,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    boxShadow: "0 18px 24px rgba(43,36,24,0.22)",
  },
  cover: {
    flex: 1,
  },
  title: {
    paddingHorizontal: theme.gap(1.25),
    paddingVertical: theme.gap(1),
    color: theme.colors.foreground,
  },
  dot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    boxShadow: "0 0 10px 3px rgba(230,162,60,0.45)",
    zIndex: 5,
  },
  globe: {
    position: "absolute",
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
    zIndex: 4,
  },
  globeCanvas: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    top: rt.insets.top + theme.gap(7),
    alignItems: "center",
    zIndex: 6,
  },
  count: {
    alignItems: "center",
  },
  number: {
    color: theme.colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  muted: {
    color: theme.colors.muted,
  },
  skip: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: rt.insets.bottom + theme.gap(5),
  },
}));

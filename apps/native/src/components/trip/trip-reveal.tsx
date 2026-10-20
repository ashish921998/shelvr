import { ThemedText } from "@/components/ui/themed-text";
import { useBuildStep } from "@/components/trip/trip-building";
import { t, useAppLocale } from "@/lib/i18n";
import {
  GLOBE_DIVE_MS,
  countryLight,
  diveTarget,
  globeCamera,
  globePaths,
  globePin,
  globeRegion,
  globeSettled,
  warmGlobe,
  type GlobePaths,
  type GlobeRegion,
  type GlobeTarget,
  tripCenter,
} from "@/lib/trip-globe";
import {
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
  Path,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
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

type TripCenterInput = { days: Parameters<typeof tripCenter>[0] };

/** Whether Trip Reveal is playing, and what it shows. `start` begins it when
 * it can play (there are covers and Reduce Motion is off) and says whether it
 * did; Reduce Motion gets the plain building panel instead. The save count is
 * taken at Build, so a save landing mid-reveal never restarts the count.
 * `built` is the new trip once it is in and shown, so the globe may dive
 * into it. */
export function useTripReveal(
  space: { items: Parameters<typeof revealCovers>[0] } | null | undefined,
  cities: { city: string }[] | undefined,
  request: { city?: string } | null,
  built: (TripCenterInput & { city?: string }) | null | undefined,
) {
  // The save count while the reveal plays, null when it is not playing.
  const [count, setCount] = useState<number | null>(null);
  // Set when a reveal starts, so skipping it before the trip arrives keeps
  // the old trip's map down: it would otherwise drop its pins, then drop
  // the new trip's again.
  const [held, setHeld] = useState(false);
  const reducedMotion = useReducedMotion();
  const requested =
    request?.city ?? (cities?.length === 1 ? cities[0].city : undefined);
  const items = space?.items;
  const covers = useMemo(
    () => revealCovers(items ?? [], requested),
    [items, requested],
  );
  const target = useMemo(
    () => (built ? tripCenter(built.days) : null),
    [built],
  );
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
    city: built?.city ?? requested,
    target,
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
  target,
  ready,
  onDone,
}: {
  covers: RevealCover[];
  count: number;
  city?: string;
  /** Where the globe dives: the middle of the trip's pins, or null. */
  target: GlobeTarget | null;
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
  // Where the city sits on screen; the globe moves it every frame of the dive.
  const pinX = useSharedValue(layout.landing.x);
  const pinY = useSharedValue(layout.landing.y);
  const pinDive = useSharedValue(0);
  const pin = useMemo(
    () => ({ x: pinX, y: pinY, dive: pinDive }),
    [pinX, pinY, pinDive],
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
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(300)}
      style={styles.screen}
    >
      <Globe stage={stage} target={target} city={city} pin={pin} />
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
          pin={pin}
          stage={stage}
        />
      ))}
      <View style={styles.caption} pointerEvents="none">
        {stage === "dive" ? (
          <Animated.View
            key="count"
            // Waits for the step text to fade out, so the two never overlap.
            entering={FadeIn.delay(150).duration(250)}
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
  pin,
  stage,
}: {
  index: number;
  dot: { x: number; y: number };
  pin: Pin;
  stage: Stage;
}) {
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
      opacity.value = withTiming(1, fade(150));
      scale.value = withTiming(1, fade(150));
    }
  }, [stage, index, scale, opacity]);

  // The dot falls towards wherever the city is on the turning globe, on the
  // globe's own clock, so a dropped map frame holds the dots back with it.
  // Staggered starts, one landing: every dot reaches the city as it settles.
  const style = useAnimatedStyle(() => {
    const delay = index * 15;
    const share = Math.min(
      1,
      Math.max(
        0,
        (pin.dive.value * GLOBE_DIVE_MS - delay) / (GLOBE_DIVE_MS - delay),
      ),
    );
    const fall = Easing.inOut(Easing.cubic)(share);
    return {
      opacity: opacity.value,
      transform: [
        { translateX: fall * (pin.x.value - dot.x) },
        { translateY: fall * (pin.y.value - dot.y) },
        { scale: scale.value * (1 - 0.4 * fall) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { left: dot.x - 5, top: dot.y - 5 }, style]}
    />
  );
}

/** Where the trip's city is on screen: the globe moves it every frame of the
 * dive, and the dots, the glow and the city's name follow it. */
type Pin = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** How far the dive has gone in time, 0 to 1, as of the last map frame. */
  dive: SharedValue<number>;
};

/** The city's name, on a pill just above the city. */
function PinLabel({ pin, city }: { pin: Pin; city: string }) {
  const { rt } = useUnistyles();
  const width = rt.screen.width;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: pin.x.value - width / 2 },
      { translateY: pin.y.value - 42 },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.pinRow, style]}>
      <Animated.View
        entering={FadeIn.delay(900).duration(300)}
        style={styles.pinLabel}
      >
        <ThemedText variant="subheadLabel" style={styles.pinText}>
          {city}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

/** One frame of the globe, as SVG paths, how lit the city's country is, and
 * where the city is on it during the dive (no point when there are no pins). */
type GlobeFrame = {
  paths: GlobePaths;
  light: number;
  pin: { point: { x: number; y: number } | null; dive: number } | null;
};

const SPIN_FRAME_MS = 1000 / 30;

const HIDDEN: GlobeFrame = {
  paths: { sphere: "", graticule: "", land: "", country: "" },
  light: 0,
  pin: null,
};

/** The globe: a real world map that rises as the saves become dots, spins
 * while the trip is built, then turns to the trip and zooms into its
 * country. Frames are drawn on the JS thread with d3 (trip-globe.ts), so they
 * stop as soon as the camera settles. */
function Globe({
  stage,
  target,
  city,
  pin,
}: {
  stage: Stage;
  target: GlobeTarget | null;
  city?: string;
  pin: Pin;
}) {
  const { theme, rt } = useUnistyles();
  const [startedAt] = useState(Date.now);
  const [frame, setFrame] = useState(HIDDEN);
  // Set once, when the dive starts: when, and the close-up map to draw.
  const dive = useRef<{ at: number; region: GlobeRegion } | null>(null);
  const glow = useSharedValue(0);
  const lng = target?.lng;
  const lat = target?.lat;
  const width = rt.screen.width;
  const height = rt.screen.height;

  // Parsing the map takes a moment; do it while the saves lift off.
  useEffect(warmGlobe, []);

  useEffect(() => {
    const aim = lng !== undefined && lat !== undefined ? { lng, lat } : null;
    if (stage === "dive" && !dive.current) {
      const at = Date.now() - startedAt;
      const region = globeRegion(diveTarget(aim, at));
      // With no pins the dive lands on open map, so no country lights up.
      dive.current = {
        at,
        region: aim ? region : { ...region, country: null },
      };
      if (aim) glow.value = withDelay(800, withTiming(0.85, fade(500)));
    }
    const screen = { width, height };
    let handle = 0;
    let shown = false;
    let drawn = -Infinity;
    const tick = () => {
      const t = Date.now() - startedAt;
      const diveAt = dive.current?.at ?? null;
      // The spin can run for as long as the build takes, so it draws at
      // 30fps to spare the JS thread; the short dive gets every frame.
      if (diveAt === null && t - drawn < SPIN_FRAME_MS) {
        handle = requestAnimationFrame(tick);
        return;
      }
      drawn = t;
      const camera = globeCamera({ t, diveAt, ...screen, target: aim });
      const paths = globePaths(camera, screen, dive.current?.region ?? null);
      // With no pins the dots fall on the screen's centre, where the dive
      // lands; they move on this frame's clock either way.
      const framePin =
        diveAt === null
          ? null
          : {
              point: aim ? globePin(camera, aim) : null,
              dive: Math.min(1, (t - diveAt) / GLOBE_DIVE_MS),
            };
      // Below the screen there is nothing to draw, so no render either.
      if (paths.sphere !== "" || shown || framePin) {
        setFrame({ paths, light: countryLight(camera.dive), pin: framePin });
        shown = paths.sphere !== "";
      }
      if (!globeSettled(t, diveAt)) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [stage, startedAt, lng, lat, width, height, glow]);

  // The dots, glow and name move only once React has committed the map frame
  // they belong to, so a slow commit holds them back with the land.
  useLayoutEffect(() => {
    if (!frame.pin) return;
    if (frame.pin.point) {
      pin.x.set(frame.pin.point.x);
      pin.y.set(frame.pin.point.y);
    }
    pin.dive.set(frame.pin.dive);
  }, [frame, pin]);

  const { paths, light } = frame;
  return (
    <>
      <Canvas style={styles.globe} pointerEvents="none">
        {paths.sphere ? (
          <Path path={paths.sphere} color={theme.colors.globeOcean} />
        ) : null}
        {paths.graticule ? (
          <Path
            path={paths.graticule}
            color={theme.colors.border}
            style="stroke"
            strokeWidth={1}
          />
        ) : null}
        {paths.land ? (
          <>
            <Path path={paths.land} color={theme.colors.globeLand} />
            <Path
              path={paths.land}
              color={theme.colors.globeLandEdge}
              style="stroke"
              strokeWidth={0.8}
            />
          </>
        ) : null}
        {paths.country ? (
          <Path
            path={paths.country}
            color={theme.colors.primary}
            opacity={0.85 * light}
          />
        ) : null}
        {paths.sphere ? (
          <Path
            path={paths.sphere}
            color={theme.colors.globeLandEdge}
            style="stroke"
            strokeWidth={1.2}
          />
        ) : null}
        <Group opacity={glow}>
          <Circle cx={pin.x} cy={pin.y} r={26} color={theme.colors.primary}>
            <BlurMask blur={8} style="normal" />
          </Circle>
          <Circle cx={pin.x} cy={pin.y} r={4} color={theme.colors.surface} />
        </Group>
      </Canvas>
      {stage === "dive" && target && city ? (
        <PinLabel pin={pin} city={city} />
      ) : null}
    </>
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  pinRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
    zIndex: 6,
  },
  pinLabel: {
    paddingHorizontal: theme.gap(1.375),
    paddingVertical: theme.gap(0.625),
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 4px 12px rgba(43,36,24,0.18)",
  },
  pinText: {
    color: theme.colors.foreground,
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

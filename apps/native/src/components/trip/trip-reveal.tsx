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
  REVEAL_LIFT,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
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

const NEVER = ReduceMotion.Never;
const SPRING = {
  lift: { duration: 450, dampingRatio: 0.72, reduceMotion: NEVER },
  fly: { duration: 800, dampingRatio: 1, reduceMotion: NEVER },
  pop: { duration: 350, dampingRatio: 0.6, reduceMotion: NEVER },
  camera: { duration: 1100, dampingRatio: 1, reduceMotion: NEVER },
};
const fade = (duration: number) => ({ duration, reduceMotion: NEVER });

type TripCenterInput = { days: Parameters<typeof tripCenter>[0] };

export function useTripReveal(
  space: { items: Parameters<typeof revealCovers>[0] } | null | undefined,
  cities: { city: string }[] | undefined,
  request: { city?: string } | null,
  built: (TripCenterInput & { city?: string }) | null | undefined,
) {
  const [count, setCount] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const reducedMotion = useReducedMotion();
  const requested =
    request?.city ?? (cities?.length === 1 ? cities[0]?.city : undefined);
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
  target: GlobeTarget | null;
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
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(300)}
      style={styles.screen}
    >
      <Globe
        stage={stage}
        target={target}
        city={city}
        dots={layout.dots}
        landing={layout.landing}
      />
      {covers.map((cover, index) => {
        const card = layout.cards[index];
        return card ? (
          <Card key={cover.id} cover={cover} card={card} stage={stage} />
        ) : null;
      })}
      <View style={styles.caption} pointerEvents="none">
        {stage === "dive" ? (
          <Animated.View
            key="count"
            entering={FadeIn.delay(150).duration(250)}
            style={styles.count}
          >
            <ThemedText variant="hero" style={styles.number}>
              {t("trip.revealSaves", { count: rolled })}
            </ThemedText>
            <ThemedText variant="subhead" style={styles.muted}>
              {city && target
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
      y.value = withDelay(delay, withSpring(-REVEAL_LIFT, SPRING.lift));
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

function Dot({
  index,
  dot,
  pin,
  stage,
  color,
}: {
  index: number;
  dot: { x: number; y: number };
  pin: Pin;
  stage: Stage;
  color: string;
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

  const breathe = useDerivedValue(() => [{ scale: scale.value }]);

  const delay = index * 15;
  const share = Math.min(
    1,
    Math.max(0, (pin.dive * GLOBE_DIVE_MS - delay) / (GLOBE_DIVE_MS - delay)),
  );
  const fall = Easing.inOut(Easing.cubic)(share);

  return (
    <Group
      transform={[
        { translateX: dot.x + fall * (pin.x - dot.x) },
        { translateY: dot.y + fall * (pin.y - dot.y) },
        { scale: 1 - 0.4 * fall },
      ]}
    >
      <Group opacity={opacity} transform={breathe}>
        <Circle r={9} color={color} opacity={0.45}>
          <BlurMask blur={5} style="normal" />
        </Circle>
        <Circle r={5} color={color} />
      </Group>
    </Group>
  );
}

type Pin = { x: number; y: number; dive: number };

function PinLabel({ pin, city }: { pin: Pin; city: string }) {
  const { rt } = useUnistyles();
  const width = rt.screen.width;
  const style = {
    transform: [{ translateX: pin.x - width / 2 }, { translateY: pin.y - 42 }],
  };
  return (
    <View pointerEvents="none" style={[styles.pinRow, style]}>
      <Animated.View
        entering={FadeIn.delay(900).duration(300)}
        style={styles.pinLabel}
      >
        <ThemedText variant="subheadLabel" style={styles.pinText}>
          {city}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

type GlobeFrame = {
  paths: GlobePaths;
  light: number;
  pin: Pin | null;
};

const SPIN_FRAME_MS = 1000 / 30;

const HIDDEN: GlobeFrame = {
  paths: { sphere: "", graticule: "", land: "", country: "" },
  light: 0,
  pin: null,
};

function Globe({
  stage,
  target,
  city,
  dots,
  landing,
}: {
  stage: Stage;
  target: GlobeTarget | null;
  city?: string;
  dots: { x: number; y: number }[];
  landing: { x: number; y: number };
}) {
  const { theme, rt } = useUnistyles();
  const [startedAt] = useState(Date.now);
  const [frame, setFrame] = useState(HIDDEN);
  const dive = useRef<{ at: number; region: GlobeRegion } | null>(null);
  const glow = useSharedValue(0);
  const lng = target?.lng;
  const lat = target?.lat;
  const width = rt.screen.width;
  const height = rt.screen.height;

  useEffect(warmGlobe, []);

  useEffect(() => {
    const aim = lng !== undefined && lat !== undefined ? { lng, lat } : null;
    if (stage === "dive" && !dive.current) {
      const at = Date.now() - startedAt;
      const region = globeRegion(diveTarget(aim, at));
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
      if (diveAt === null && t - drawn < SPIN_FRAME_MS) {
        handle = requestAnimationFrame(tick);
        return;
      }
      drawn = t;
      const camera = globeCamera({ t, diveAt, ...screen, target: aim });
      const paths = globePaths(camera, screen, dive.current?.region ?? null);
      const framePin =
        diveAt === null
          ? null
          : {
              ...(aim ? globePin(camera, aim) : landing),
              dive: Math.min(1, (t - diveAt) / GLOBE_DIVE_MS),
            };
      if (paths.sphere !== "" || shown || framePin) {
        setFrame({ paths, light: countryLight(camera.dive), pin: framePin });
        shown = paths.sphere !== "";
      }
      if (!globeSettled(t, diveAt)) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [stage, startedAt, lng, lat, width, height, glow, landing]);

  const { paths, light } = frame;
  const pin = frame.pin ?? { ...landing, dive: 0 };
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
        {dots.map((dot, index) => (
          <Dot
            key={`${dot.x}:${dot.y}`}
            index={index}
            dot={dot}
            pin={pin}
            stage={stage}
            color={theme.colors.primary}
          />
        ))}
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

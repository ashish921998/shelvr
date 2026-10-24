import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { PhoneFrame } from "@/components/onboarding/opener-phone";
import {
  DayStops,
  MapPin,
  SceneMap,
  type MapSize,
  type Point,
  type SceneStop,
} from "@/components/onboarding/opener-scenes";
import { splashTheme } from "@/components/splash/timeline";
import { isDarkThemeName } from "@/lib/appearance";
import { t, useAppLocale } from "@/lib/i18n";
import { easeInOut, span, threadJitter } from "@/lib/splash/composition";
import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { Image } from "expo-image";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// One pin per stop, in the order the evening goes.
const PINS: Point[] = [
  { x: 0.24, y: 0.32 },
  { x: 0.62, y: 0.22 },
  { x: 0.7, y: 0.68 },
];

const STOPS: SceneStop[] = [
  { slot: "signInScene.sunset", name: "onboarding.sceneMiradouro" },
  { slot: "signInScene.dinner", name: "onboarding.sceneTimeOut" },
  { slot: "signInScene.dessert", name: "onboarding.scenePasteis" },
];

const REELS = [
  CITY_PICTURES.lisbon.view,
  CITY_PICTURES.lisbon.food,
  require("../../assets/onboarding/prague.jpg"),
];

// The splash's thread: thin, a little unsteady, drawn end to end once.
const THREAD_WIDTH = 1.6;
const THREAD_MS = 1400;
const THREAD_DELAY_MS = 300;
const SAMPLES_PER_LEG = 36;

/** A thread through the pins: each leg bows a little and trembles like the splash's. */
function threadPath(points: Point[], { width, height }: MapSize): SkPath {
  const path = Skia.PathBuilder.Make();
  const at = points.map((p) => ({ x: p.x * width, y: p.y * height }));
  path.moveTo(at[0].x, at[0].y);
  let step = 0;
  for (let leg = 1; leg < at.length; leg++) {
    const from = at[leg - 1];
    const to = at[leg];
    const bow = leg % 2 === 0 ? 0.18 : -0.18;
    const control = {
      x: (from.x + to.x) / 2 - (to.y - from.y) * bow,
      y: (from.y + to.y) / 2 + (to.x - from.x) * bow,
    };
    for (let i = 1; i <= SAMPLES_PER_LEG; i++, step++) {
      const k = i / SAMPLES_PER_LEG;
      const x =
        (1 - k) ** 2 * from.x + 2 * (1 - k) * k * control.x + k ** 2 * to.x;
      const y =
        (1 - k) ** 2 * from.y + 2 * (1 - k) * k * control.y + k ** 2 * to.y;
      path.lineTo(x + threadJitter(step), y);
    }
  }
  return path.detach();
}

/** A pin that pops in as the thread reaches it. */
function ThreadPin({
  index,
  drawn,
}: {
  index: number;
  drawn: SharedValue<number>;
}) {
  const reachedAt = index / (PINS.length - 1);
  const style = useAnimatedStyle(() => {
    const shown = span(drawn.get(), reachedAt - 0.1, reachedAt);
    return { opacity: shown, transform: [{ scale: 0.6 + 0.4 * shown }] };
  });
  return <MapPin number={index + 1} point={PINS[index]} style={style} />;
}

function Thread({
  size,
  drawn,
}: {
  size: MapSize;
  drawn: SharedValue<number>;
}) {
  const { rt } = useUnistyles();
  const path = useMemo(() => threadPath(PINS, size), [size]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path
        path={path}
        style="stroke"
        strokeWidth={THREAD_WIDTH}
        strokeCap="round"
        strokeJoin="round"
        color={splashTheme(isDarkThemeName(rt.themeName)).palette.thread}
        start={0}
        end={drawn}
      />
    </Canvas>
  );
}

function RouteMap() {
  const reduced = useReducedMotion();
  const clock = useSharedValue(reduced ? 1 : 0);
  const drawn = useDerivedValue(() => easeInOut(clock.get()));

  useEffect(() => {
    if (reduced) return;
    clock.set(
      withDelay(
        THREAD_DELAY_MS,
        withTiming(1, { duration: THREAD_MS, easing: Easing.linear }),
      ),
    );
  }, [reduced, clock]);

  return (
    <SceneMap style={styles.map}>
      {(size) => (
        <>
          <Thread size={size} drawn={drawn} />
          {PINS.map((_, index) => (
            <ThreadPin key={index} index={index} drawn={drawn} />
          ))}
        </>
      )}
    </SceneMap>
  );
}

/** The opener's phone, showing three saved reels turned into a date night in Lisbon. */
export function SignInHero() {
  useAppLocale();
  return (
    <PhoneFrame>
      <View style={styles.screen}>
        <Text style={styles.city}>{t("onboarding.sceneLisbon")}</Text>
        <Text style={styles.meta}>{t("onboarding.sceneSpaceMeta")}</Text>
        <RouteMap />
        <View style={styles.reels}>
          {REELS.map((source, index) => (
            <Image
              key={index}
              source={source}
              style={styles.reel}
              contentFit="cover"
            />
          ))}
          <Text style={styles.reelsLabel} numberOfLines={3}>
            {t("signInScene.fromReels")}
          </Text>
        </View>
        <DayStops title={t("signInScene.dateTitle")} stops={STOPS} />
      </View>
    </PhoneFrame>
  );
}

const REEL = 32;

const styles = StyleSheet.create((theme) => ({
  // Pinned to the top so the scene never sets the frame's height: the frame
  // takes the room the buttons leave and clips the scene at its fade.
  screen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: theme.gap(5),
    paddingHorizontal: theme.gap(1.75),
    gap: theme.gap(0.5),
  },
  city: {
    ...theme.type.title,
    color: theme.colors.foreground,
  },
  meta: {
    ...theme.type.finePrint,
    color: theme.colors.muted,
  },
  map: {
    flex: 0,
    height: 120,
  },
  reels: {
    marginVertical: theme.gap(1),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  reel: {
    width: REEL,
    height: REEL * 1.25,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
  },
  reelsLabel: {
    ...theme.type.finePrint,
    flex: 1,
    color: theme.colors.muted,
  },
}));

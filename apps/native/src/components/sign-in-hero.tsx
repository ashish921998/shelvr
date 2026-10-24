import { PhoneFrame } from "@/components/onboarding/opener-phone";
import { SPLASH_THEMES } from "@/components/splash/timeline";
import { t, useAppLocale } from "@/lib/i18n";
import { easeInOut, span } from "@/lib/splash/composition";
import type { TextMessageKey } from "@/locales/message-types";
import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Point = { x: number; y: number };

// One pin per stop, in the order the evening goes.
const PINS: Point[] = [
  { x: 0.24, y: 0.32 },
  { x: 0.62, y: 0.22 },
  { x: 0.7, y: 0.68 },
];

const BLOCKS = [
  { left: "6%", top: "8%", width: "26%", height: "18%" },
  { left: "40%", top: "6%", width: "32%", height: "14%" },
  { left: "8%", top: "44%", width: "20%", height: "22%" },
  { left: "50%", top: "38%", width: "40%", height: "18%" },
] as const;

const STOPS: { slot: TextMessageKey; name: TextMessageKey }[] = [
  { slot: "signInScene.sunset", name: "onboarding.sceneMiradouro" },
  { slot: "signInScene.dinner", name: "onboarding.sceneTimeOut" },
  { slot: "signInScene.dessert", name: "onboarding.scenePasteis" },
];

const REELS = [
  require("../../assets/onboarding/city-lisbon-view.jpg"),
  require("../../assets/onboarding/city-lisbon-food.jpg"),
  require("../../assets/onboarding/prague.jpg"),
];

// The splash's thread: thin, a little unsteady, drawn end to end once.
const THREAD_WIDTH = 1.6;
const THREAD_MS = 1400;
const THREAD_DELAY_MS = 300;
const SAMPLES_PER_LEG = 36;

/** A hand-drawn thread through the pins: each leg bows a little and wobbles like the splash's. */
function threadPath(points: Point[], width: number, height: number): SkPath {
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
      path.lineTo(
        x + 0.7 * Math.sin(step * 0.61 + 1) + 0.4 * Math.sin(step * 1.73),
        y + 0.5 * Math.cos(step * 0.83),
      );
    }
  }
  return path.detach();
}

function Pin({
  index,
  pin,
  drawn,
}: {
  index: number;
  pin: Point;
  drawn: SharedValue<number>;
}) {
  // The thread reaches pin `index` at this share of its length.
  const reachedAt = index / (PINS.length - 1);
  const style = useAnimatedStyle(() => {
    const shown = span(drawn.get(), reachedAt - 0.1, reachedAt);
    return { opacity: shown, transform: [{ scale: 0.6 + 0.4 * shown }] };
  });
  return (
    <Animated.View
      style={[
        styles.pin,
        { left: `${pin.x * 100}%`, top: `${pin.y * 100}%` },
        style,
      ]}
    >
      <Text style={styles.pinText}>{index + 1}</Text>
    </Animated.View>
  );
}

function RouteMap() {
  const { rt } = useUnistyles();
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const clock = useSharedValue(reduced ? 1 : 0);
  const drawn = useDerivedValue(() => easeInOut(clock.get()));
  const thread = useMemo(
    () => (size.width > 0 ? threadPath(PINS, size.width, size.height) : null),
    [size.width, size.height],
  );

  useEffect(() => {
    if (size.width === 0 || reduced) return;
    clock.set(
      withDelay(THREAD_DELAY_MS, withTiming(1, { duration: THREAD_MS })),
    );
  }, [size.width, reduced, clock]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };
  const palette =
    SPLASH_THEMES[rt.themeName === "dark" ? "dark" : "light"].palette;

  return (
    <View style={styles.map} onLayout={onLayout}>
      {BLOCKS.map((block, index) => (
        <View key={index} style={[styles.block, block]} />
      ))}
      <View style={styles.river} />
      {thread ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            path={thread}
            style="stroke"
            strokeWidth={THREAD_WIDTH}
            strokeCap="round"
            strokeJoin="round"
            color={palette.thread}
            start={0}
            end={drawn}
          />
        </Canvas>
      ) : null}
      {PINS.map((pin, index) => (
        <Pin key={index} index={index} pin={pin} drawn={drawn} />
      ))}
    </View>
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
        <View style={styles.day}>
          <Text style={styles.dayTitle}>{t("signInScene.dateTitle")}</Text>
          {STOPS.map((stop) => (
            <View key={stop.slot} style={styles.stop}>
              <Text
                style={styles.stopSlot}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t(stop.slot)}
              </Text>
              <Text
                style={styles.stopName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t(stop.name)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </PhoneFrame>
  );
}

const PIN = 22;
const REEL = 32;
const MAP_HEIGHT = 112;

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
    height: MAP_HEIGHT,
    marginTop: theme.gap(1),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  block: {
    position: "absolute",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  river: {
    position: "absolute",
    left: "-10%",
    right: "-10%",
    bottom: "-8%",
    height: "20%",
    transform: [{ rotate: "-7deg" }],
    backgroundColor: theme.colors.border,
  },
  pin: {
    position: "absolute",
    width: PIN,
    height: PIN,
    marginLeft: -PIN / 2,
    marginTop: -PIN / 2,
    borderRadius: PIN / 2,
    borderWidth: 2,
    borderColor: theme.colors.frame,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  pinText: {
    ...theme.type.badge,
    color: theme.colors.onTint,
  },
  reels: {
    marginTop: theme.gap(1),
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
  day: {
    paddingTop: theme.gap(1),
    gap: theme.gap(0.75),
  },
  dayTitle: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  stopSlot: {
    ...theme.type.badge,
    width: 64,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  stopName: {
    ...theme.type.captionLabel,
    flex: 1,
    color: theme.colors.foreground,
  },
}));

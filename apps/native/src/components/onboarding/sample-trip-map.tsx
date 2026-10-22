import { isDarkThemeName } from "@/lib/appearance";
import { t, useAppLocale } from "@/lib/i18n";
import {
  SAMPLE_MAP,
  sampleStops,
  type SampleCrop,
  type SampleTrip,
} from "@/lib/sample-trip";
import {
  Canvas,
  DashPathEffect,
  Group,
  Path,
  RoundedRect,
} from "@shopify/react-native-skia";
import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The sample trip's map: a drawing of the city's water and a few blocks with
// the trip's pins on it, dotted routes joining each day's stops. It is drawn,
// not fetched, so it is there at once, works offline and never shows a blank
// tile.

const PIN_SIZE = 22;
const BLOCKS = [
  [226, 52, 34, 16],
  [268, 60, 30, 20],
  [214, 96, 40, 14],
  [262, 100, 34, 18],
  [104, 72, 30, 14],
  [136, 100, 24, 12],
] as const;
// A zero-length dash with a round cap is a dot.
const DOTS = [0.1, 6];
// Water has no theme role, so each theme names its own.
const WATER = { light: "#cfdcd7", dark: "#2f4147" };

/** The pin colors for a day: the first day is amber, later days are dark. */
export function usePinColors() {
  const { theme } = useUnistyles();
  return (day: number) =>
    day === 0
      ? { background: theme.colors.primary, text: theme.colors.onTint }
      : { background: theme.colors.foreground, text: theme.colors.background };
}

/** A stop's numbered pin. */
export function PinBadge({ number, day }: { number: number; day: number }) {
  const pinColors = usePinColors();
  const colors = pinColors(day);
  return (
    <View style={[styles.pin, { backgroundColor: colors.background }]}>
      <Text style={[styles.pinText, { color: colors.text }]}>{number}</Text>
    </View>
  );
}

function routePath(trip: SampleTrip, day: number): string {
  return sampleStops(trip)
    .filter((entry) => entry.day === day)
    .map(
      ({ stop }, index) =>
        `${index === 0 ? "M" : "L"}${stop.pin.x} ${stop.pin.y}`,
    )
    .join(" ");
}

/** The sample map, cut to `crop`. It lays itself out at the card's width. */
export function SampleTripMap({
  trip,
  crop,
}: {
  trip: SampleTrip;
  crop: SampleCrop;
}) {
  useAppLocale();
  const { theme, rt } = useUnistyles();
  const pinColors = usePinColors();
  const [width, setWidth] = useState(0);
  const dark = isDarkThemeName(rt.themeName);
  const scale = width / SAMPLE_MAP.width;
  const stops = sampleStops(trip);

  return (
    <View
      style={[styles.map, { aspectRatio: SAMPLE_MAP.width / crop.height }]}
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("tripTeaser.mapLabel", {
        city: t(trip.name),
        places: String(stops.length),
      })}
    >
      {width > 0 ? (
        <>
          <Canvas style={styles.canvas} pointerEvents="none">
            <Group transform={[{ scale }, { translateY: -crop.top }]}>
              {BLOCKS.map(([x, y, w, h]) => (
                <RoundedRect
                  key={`${x}:${y}`}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  r={3}
                  color={theme.colors.border}
                />
              ))}
              {trip.water.map((line) => (
                <Path
                  key={line}
                  path={line}
                  style="stroke"
                  strokeWidth={20}
                  strokeCap="round"
                  strokeJoin="round"
                  color={dark ? WATER.dark : WATER.light}
                />
              ))}
              {trip.days.map((_, day) => (
                <Path
                  key={day}
                  path={routePath(trip, day)}
                  style="stroke"
                  strokeWidth={2.5}
                  strokeCap="round"
                  color={pinColors(day).background}
                >
                  <DashPathEffect intervals={DOTS} />
                </Path>
              ))}
            </Group>
          </Canvas>
          {stops.map(({ stop, day, number }) => (
            <View
              key={number}
              pointerEvents="none"
              style={[
                styles.placed,
                {
                  left: stop.pin.x * scale - PIN_SIZE / 2,
                  top: (stop.pin.y - crop.top) * scale - PIN_SIZE / 2,
                },
              ]}
            >
              <PinBadge number={number} day={day} />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  map: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  placed: {
    position: "absolute",
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 14,
    includeFontPadding: false,
  },
}));

import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import type { SampleTrip } from "@/lib/sample-trip";
import type { LatLng } from "@/lib/trip";
import { AppleMaps } from "expo-maps";
import { useEffect, useRef, useState } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const DAY_MS = 3500;
/** About 400 metres, so a single pin or a tight cluster does not zoom to the street. */
const MIN_SPAN = 0.004;

type Size = { width: number; height: number };

/** Share of the open map the pins span, so none sits on an edge. */
const FILL = 0.8;
/** Keeps the pins clear of the label over the map's top and the sheet over its bottom. */
const TOP = 56;
const BOTTOM = 48;

// expo-maps on iOS turns zoom into a region 360 / 2^zoom degrees of latitude tall and fits it to the
// map's height, so the zoom comes from the degrees the height must show, whatever the map's size.
function cameraFor(points: LatLng[], size: Size) {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const open = Math.max(size.height - TOP - BOTTOM, 1);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN);
  const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), MIN_SPAN);
  // Degrees of latitude the full height must show for the points to fit the open band and the width.
  const latDelta =
    Math.max(
      (latSpan * size.height) / open,
      (lngSpan * size.height * cos) / size.width,
    ) / FILL;
  const zoom = Math.min(16, Math.max(3, Math.log2(360 / latDelta)));
  const latPerPoint = 360 / 2 ** zoom / size.height;
  return {
    coordinates: {
      // The points centre in the open band, which sits lower than the map's middle when TOP > BOTTOM.
      latitude: midLat + (TOP + open / 2 - size.height / 2) * latPerPoint,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    },
    zoom,
  };
}

/** `visible` shows only the first that many pins, so they can drop in one by one; `style` replaces the default 2:1 box. */
export function SampleAppleMap({
  trip,
  visible = Infinity,
  style,
}: {
  trip: SampleTrip;
  visible?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, rt } = useUnistyles();
  const reduced = useReducedMotion();
  const ref = useRef<AppleMaps.MapView>(null);
  const [size, setSize] = useState<Size>();
  const [shown, setShown] = useState(0);
  const colors = [
    { pin: theme.colors.primary, text: theme.colors.onTint },
    { pin: theme.colors.foreground, text: theme.colors.background },
  ];
  const days = trip.days.map((day) =>
    day.stops.map((stop) => ({
      name: stop.name,
      coordinates: { latitude: stop.at.lat, longitude: stop.at.lng },
    })),
  );
  const firsts = days.map((_, day) =>
    days.slice(0, day).reduce((count, stops) => count + stops.length, 0),
  );
  const dayCount = days.length;

  useEffect(() => {
    if (reduced || dayCount < 2) return;
    const timer = setInterval(
      () => setShown((day) => (day + 1) % dayCount),
      DAY_MS,
    );
    return () => clearInterval(timer);
  }, [reduced, dayCount]);

  const shownPoints = days[shown]?.map((stop) => stop.coordinates);
  const shownKey = JSON.stringify(shownPoints);
  useEffect(() => {
    if (!size || !shownPoints) return;
    const camera = cameraFor(shownPoints, size);
    if (!camera) return;
    ref.current
      ?.setCameraPosition(camera)
      .catch((error: unknown) =>
        analytics.captureError("sample_map_camera_failed", error),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownKey stands for shownPoints, a new array each render
  }, [shownKey, size]);

  const firstCamera =
    size &&
    days[0] &&
    cameraFor(
      days[0].map((stop) => stop.coordinates),
      size,
    );
  return (
    <View
      style={[styles.box, style ?? styles.wide]}
      pointerEvents="none"
      onLayout={(event: LayoutChangeEvent) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {firstCamera && (
        <AppleMaps.View
          ref={ref}
          style={StyleSheet.absoluteFill}
          cameraPosition={firstCamera}
          colorScheme={
            isDarkThemeName(rt.themeName)
              ? AppleMaps.MapColorScheme.DARK
              : AppleMaps.MapColorScheme.LIGHT
          }
          uiSettings={{
            compassEnabled: false,
            myLocationButtonEnabled: false,
            togglePitchEnabled: false,
          }}
          properties={{ pointsOfInterest: { including: [] } }}
          annotations={days
            .flatMap((stops, day) =>
              stops.map((stop, index) => ({
                id: `${day}:${index}`,
                coordinates: stop.coordinates,
                title: stop.name,
                text: String(firsts[day]! + index + 1),
                backgroundColor: colors[day % 2]!.pin,
                textColor: colors[day % 2]!.text,
              })),
            )
            .slice(0, visible)}
          polylines={days.map((stops, day) => ({
            id: `route-${day}`,
            coordinates: stops.map((stop) => stop.coordinates),
            color: colors[day % 2]!.pin,
            width: 3,
          }))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    backgroundColor: theme.colors.primarySoft,
  },
  wide: {
    width: "100%",
    aspectRatio: 340 / 170,
  },
}));

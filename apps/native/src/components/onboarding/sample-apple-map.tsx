import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import type { SampleTrip } from "@/lib/sample-trip";
import { fitCamera, type LatLng } from "@/lib/trip";
import { AppleMaps } from "expo-maps";
import { useEffect, useRef, useState } from "react";
import { PixelRatio, View, type LayoutChangeEvent } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const DAY_MS = 3500;

type Size = { width: number; height: number };

// expo-maps on iOS counts zoom against the screen's pixels, so a world tile is 256 pixels, not points.
const cameraFor = (points: LatLng[], size: Size) =>
  fitCamera(points, {
    ...size,
    top: 0,
    bottom: 0,
    worldWidth: 512 / PixelRatio.get(),
    centerY: size.height / 2,
  });

export function SampleAppleMap({ trip }: { trip: SampleTrip }) {
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
      style={styles.box}
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
          uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
          properties={{ pointsOfInterest: { including: [] } }}
          annotations={days.flatMap((stops, day) =>
            stops.map((stop, index) => ({
              id: `${day}:${index}`,
              coordinates: stop.coordinates,
              title: stop.name,
              text: String(firsts[day]! + index + 1),
              backgroundColor: colors[day % 2]!.pin,
              textColor: colors[day % 2]!.text,
            })),
          )}
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
    width: "100%",
    aspectRatio: 340 / 170,
    backgroundColor: theme.colors.primarySoft,
  },
}));

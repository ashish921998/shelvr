import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import type { SampleTrip } from "@/lib/sample-trip";
import { fitCamera, type LatLng } from "@/lib/trip";
import { AppleMaps } from "expo-maps";
import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Size = { width: number; height: number };

/** Keeps the pins clear of the label over the map's top and the sheet over its bottom. */
const TOP = 56;
const BOTTOM = 48;

// Framed the way the city page frames its pins (city-map.tsx), so the preview matches the page.
function cameraFor(points: LatLng[], size: Size) {
  const standard = fitCamera(points, {
    ...size,
    top: TOP,
    bottom: BOTTOM,
    worldWidth: 256,
    centerY: size.height / 2,
  });
  return (
    standard && {
      coordinates: standard.coordinates,
      zoom: appleZoom(
        standard.zoom,
        standard.coordinates.latitude,
        size.width,
        size.height,
      ),
    }
  );
}

/** The trip's stops on a map that fills its parent; `visible` shows only the first that many pins, so they can drop in one by one. */
export function SampleAppleMap({
  trip,
  visible = Infinity,
}: {
  trip: SampleTrip;
  visible?: number;
}) {
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const [size, setSize] = useState<Size>();
  const stops = trip.days
    .flatMap((day) => day.stops)
    .map((stop) => ({
      name: stop.name,
      coordinates: { latitude: stop.at.lat, longitude: stop.at.lng },
    }));
  const camera =
    size &&
    cameraFor(
      stops.map((stop) => stop.coordinates),
      size,
    );
  const cameraKey = JSON.stringify(camera);

  // The map mounts at the first camera through cameraPosition and refuses a move there right away, so only a later size moves it.
  const mounted = useRef(false);
  useEffect(() => {
    if (!camera) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    ref.current
      ?.setCameraPosition(camera)
      .catch((error: unknown) =>
        analytics.captureError("sample_map_camera_failed", error),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameraKey stands for camera, a new object each render
  }, [cameraKey]);

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
      {camera && (
        <AppleMaps.View
          ref={ref}
          style={StyleSheet.absoluteFill}
          cameraPosition={camera}
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
          annotations={stops
            .map((stop, index) => ({
              id: String(index),
              coordinates: stop.coordinates,
              title: stop.name,
              text: String(index + 1),
              backgroundColor: theme.colors.primary,
              textColor: theme.colors.onTint,
            }))
            .slice(0, visible)}
          polylines={[
            {
              id: "route",
              coordinates: stops.map((stop) => stop.coordinates),
              color: theme.colors.primary,
              width: 3,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    flex: 1,
    backgroundColor: theme.colors.primarySoft,
  },
}));

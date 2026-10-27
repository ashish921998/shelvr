import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { withAlpha } from "@/lib/color";
import { moveCamera } from "@/lib/map-camera";
import { fitCamera, type LatLng } from "@/lib/trip";
import { pinDay, planPins } from "@/lib/trip-planner";
import type { TripPlanDetail } from "@convex/model/tripPlan";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const FADED = 0.35;
const STAY_ID = "stay";

type Props = {
  days: TripPlanDetail["days"];
  stay: TripPlanDetail["stay"];
  /** The day in focus, or null for the whole trip. */
  activeDay: number | null;
  height: number;
  onSelectDay: (day: number) => void;
};

export function TripPlannerMap({
  days,
  stay,
  activeDay,
  height,
  onSelectDay,
}: Props) {
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const pins = useMemo(() => planPins(days, activeDay), [days, activeDay]);
  const stayLat = stay?.lat;
  const stayLng = stay?.lng;
  const stayPoint = useMemo<LatLng | null>(
    () =>
      stayLat !== undefined && stayLng !== undefined
        ? { latitude: stayLat, longitude: stayLng }
        : null,
    [stayLat, stayLng],
  );

  const { width } = rt.screen;
  const top = rt.insets.top + theme.gap(6);
  const camera = useMemo(() => {
    const focused = pins.filter((pin) => pin.active).map((p) => p.coordinates);
    const all = pins.map((pin) => pin.coordinates);
    const points =
      focused.length > 0
        ? focused
        : all.length > 0
          ? all
          : stayPoint
            ? [stayPoint]
            : [];
    return fitCamera(points, {
      width,
      height,
      top,
      bottom: theme.gap(2),
      ...(process.env.EXPO_OS === "ios"
        ? {
            worldWidth: width,
            centerY: rt.insets.top + (height - rt.insets.top) / 2,
          }
        : { worldWidth: 256, centerY: height / 2 }),
    });
  }, [pins, stayPoint, width, height, top, theme, rt.insets.top]);

  // expo-maps applies every cameraPosition change without animation, so the prop holds the first camera only.
  const [firstCamera, setFirstCamera] = useState(camera);
  if (firstCamera === undefined && camera !== undefined) setFirstCamera(camera);
  useEffect(() => {
    if (!camera || camera === firstCamera) return;
    return moveCamera(
      () => ref.current?.setCameraPosition(camera),
      (error) => analytics.captureError("trip_plan_map_camera_failed", error),
    );
  }, [camera, firstCamera]);

  const routes = days
    .map((stops, day) => ({
      day,
      coordinates: stops.map((s) => ({ latitude: s.lat, longitude: s.lng })),
    }))
    .filter((route) => route.coordinates.length >= 2);
  const routeColor = (day: number) =>
    activeDay === null || activeDay === day
      ? theme.colors.primary
      : withAlpha(theme.colors.muted, FADED);

  const select = (id: string | undefined) => {
    const day = pinDay(id);
    if (day !== null) onSelectDay(day);
  };

  if (process.env.EXPO_OS === "ios") {
    return (
      <View style={[styles.map, { height }]}>
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
          }}
          annotations={pins.map((pin) => ({
            id: pin.id,
            coordinates: pin.coordinates,
            title: pin.name,
            text: String(pin.number),
            backgroundColor: pin.active
              ? theme.colors.primary
              : withAlpha(theme.colors.muted, FADED),
            textColor: theme.colors.onTint,
          }))}
          markers={
            stayPoint && stay
              ? [
                  {
                    id: STAY_ID,
                    coordinates: stayPoint,
                    title: stay.name,
                    systemImage: "bed.double.fill",
                    tintColor: theme.colors.foreground,
                  },
                ]
              : []
          }
          polylines={routes.map((route) => ({
            id: `route-${route.day}`,
            coordinates: route.coordinates,
            color: routeColor(route.day),
            width: activeDay === route.day ? 4 : 3,
          }))}
          onAnnotationClick={(pin) => select(pin.id)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.map, { height }]}>
      <GoogleMaps.View
        style={StyleSheet.absoluteFill}
        cameraPosition={camera}
        markers={[
          ...pins.map((pin) => ({
            id: pin.id,
            coordinates: pin.coordinates,
            title: `${pin.number}. ${pin.name}`,
          })),
          ...(stayPoint && stay
            ? [{ id: STAY_ID, coordinates: stayPoint, title: stay.name }]
            : []),
        ]}
        polylines={routes.map((route) => ({
          coordinates: route.coordinates,
          color: routeColor(route.day),
          width: activeDay === route.day ? 10 : 7,
        }))}
        onMarkerClick={(marker) => select(marker.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  map: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
}));

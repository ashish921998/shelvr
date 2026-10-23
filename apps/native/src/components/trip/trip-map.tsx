import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import {
  fitCamera,
  locatedStops,
  TRIP_PANEL_SHARE,
  type LatLng,
  type Trip,
} from "@/lib/trip";
import {
  TRIP_SIDE_PANEL_MARGIN,
  TRIP_SIDE_PANEL_WIDTH,
  useTripSidePanel,
} from "@/lib/wide-layout";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PIN_STAGGER_MS = 80;

export type StopRef = { day: number; stop: number };

const pinId = (ref: StopRef) => `${ref.day}:${ref.stop}`;

function parsePin(id: string | undefined): StopRef | null {
  const [day, stop] = (id ?? "").split(":").map(Number);
  return Number.isInteger(day) && Number.isInteger(stop) ? { day, stop } : null;
}

const FADED_ALPHA = "59";

type Props = {
  trip: Trip;
  activeDay: number;
  selected: StopRef | null;
  onSelect: (ref: StopRef) => void;
  onMapPress: () => void;
};

export function TripMap({
  trip,
  activeDay,
  selected,
  onSelect,
  onMapPress,
}: Props) {
  const { theme, rt } = useUnistyles();
  const reduced = useReducedMotion();
  const ref = useRef<AppleMaps.MapView>(null);
  const days = useMemo(
    () => trip.days.map((day) => locatedStops(day.stops)),
    [trip.days],
  );
  const active = useMemo(() => days[activeDay] ?? [], [days, activeDay]);
  const revealKey = `${trip._id}:${activeDay}`;
  const [reveal, setReveal] = useState({ key: "", count: 0 });

  useEffect(() => {
    if (reduced) return;
    let shown = 0;
    const timer = setInterval(() => {
      shown += 1;
      setReveal({ key: revealKey, count: shown });
      if (shown >= active.length) clearInterval(timer);
    }, PIN_STAGGER_MS);
    return () => clearInterval(timer);
  }, [revealKey, active.length, reduced]);

  const revealed = reduced
    ? active.length
    : reveal.key === revealKey
      ? reveal.count
      : 0;

  const { width, height } = rt.screen;
  const side = useTripSidePanel();
  const top = rt.insets.top + theme.gap(7);
  const camera = useMemo(() => {
    const points: LatLng[] = active.map((s) => s.coordinates);
    return fitCamera(
      points.length > 0 ? points : days.flat().map((s) => s.coordinates),
      {
        width,
        height,
        top,
        ...(side
          ? {
              bottom: rt.insets.bottom,
              left:
                rt.insets.left + TRIP_SIDE_PANEL_MARGIN + TRIP_SIDE_PANEL_WIDTH,
              right: rt.insets.right,
            }
          : { bottom: height * TRIP_PANEL_SHARE }),
        ...(process.env.EXPO_OS === "ios"
          ? {
              worldWidth: width,
              centerY: top + (height - top - rt.insets.bottom) / 2,
            }
          : { worldWidth: 256, centerY: height / 2 }),
      },
    );
  }, [
    active,
    days,
    width,
    height,
    top,
    side,
    rt.insets.bottom,
    rt.insets.left,
    rt.insets.right,
  ]);

  // expo-maps applies every cameraPosition prop change without animation, so the prop holds only the first camera.
  // setCameraPosition goes through the native view, which is not registered yet on mount.
  const [firstCamera, setFirstCamera] = useState(camera);
  if (firstCamera === undefined && camera !== undefined) setFirstCamera(camera);
  useEffect(() => {
    if (!camera || camera === firstCamera) return;
    ref.current
      ?.setCameraPosition(camera)
      .catch((error: unknown) =>
        analytics.captureError("trip_map_camera_failed", error),
      );
  }, [camera, firstCamera]);

  const pins = days.flatMap((stops, day) =>
    stops
      .filter((_, located) => day !== activeDay || located < revealed)
      .map((s) => {
        const at: StopRef = { day, stop: s.index };
        const isSelected = selected?.day === day && selected.stop === s.index;
        return {
          id: pinId(at),
          coordinates: s.coordinates,
          title: s.stop.name,
          text: String(s.index + 1),
          backgroundColor: isSelected
            ? theme.colors.foreground
            : day === activeDay
              ? theme.colors.primary
              : `${theme.colors.muted}${FADED_ALPHA}`,
          textColor: isSelected ? theme.colors.primary : theme.colors.onTint,
        };
      }),
  );

  const route = active.slice(0, revealed).map((s) => s.coordinates);

  if (process.env.EXPO_OS === "ios") {
    return (
      <AppleMaps.View
        ref={ref}
        style={styles.map}
        cameraPosition={firstCamera}
        colorScheme={
          isDarkThemeName(rt.themeName)
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
        annotations={pins}
        polylines={
          route.length >= 2
            ? [
                {
                  id: `route-${activeDay}`,
                  coordinates: route,
                  color: theme.colors.primary,
                  width: 3,
                },
              ]
            : []
        }
        onAnnotationClick={(pin) => {
          const at = parsePin(pin.id);
          if (at) onSelect(at);
        }}
        onMapClick={onMapPress}
      />
    );
  }

  return (
    <GoogleMaps.View
      style={styles.map}
      cameraPosition={camera}
      markers={pins.map((pin) => ({
        id: pin.id,
        coordinates: pin.coordinates,
        title: `${pin.text}. ${pin.title}`,
      }))}
      polylines={
        route.length >= 2
          ? [{ coordinates: route, color: theme.colors.primary, width: 8 }]
          : []
      }
      onMarkerClick={(marker) => {
        const at = parsePin(marker.id);
        if (at) onSelect(at);
      }}
      onMapClick={onMapPress}
    />
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});

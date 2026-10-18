import { isDarkThemeName } from "@/lib/appearance";
import {
  dayColor,
  fitCamera,
  locatedStops,
  TRIP_PANEL_SHARE,
  type LatLng,
  type Trip,
} from "@/lib/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The open day's pins appear 80ms apart, and its route line extends with
// them.
const PIN_STAGGER_MS = 80;

export type StopRef = { day: number; stop: number };

const pinId = (ref: StopRef) => `${ref.day}:${ref.stop}`;

function parsePin(id: string | undefined): StopRef | null {
  const [day, stop] = (id ?? "").split(":").map(Number);
  return Number.isInteger(day) && Number.isInteger(stop) ? { day, stop } : null;
}

/** Hex alpha suffix (about 35%) for other days' pins, so the whole trip
 * stays visible. */
const FADED_ALPHA = "59";

type Props = {
  trip: Trip;
  activeDay: number;
  selected: StopRef | null;
  onSelect: (ref: StopRef) => void;
  onMapPress: () => void;
};

/**
 * The trip on Apple Maps (iOS) or Google Maps: numbered pins colored by day,
 * the open day's route, and a camera that flies to each day.
 */
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
  // How many of the open day's pins are out, for the trip and day it was
  // counted for; any other day starts from none.
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
  // The header covers the top of the map and the day list its lower half.
  const top = rt.insets.top + theme.gap(7);
  const camera = useMemo(() => {
    const points: LatLng[] = active.map((s) => s.coordinates);
    return fitCamera(
      points.length > 0 ? points : days.flat().map((s) => s.coordinates),
      {
        width,
        height,
        top,
        bottom: height * TRIP_PANEL_SHARE,
        ...(process.env.EXPO_OS === "ios"
          ? // expo-maps sets a region whose longitude spans the map's
            // width; Apple centers it between the header and the home
            // indicator (measured on an iPhone 17 Pro simulator).
            {
              worldWidth: width,
              centerY: top + (height - top - rt.insets.bottom) / 2,
            }
          : // Google Maps: 256 dp span the world at zoom 0, and the camera's
            // center is the map's.
            { worldWidth: 256, centerY: height / 2 }),
      },
    );
  }, [active, days, width, height, top, rt.insets.bottom]);

  useEffect(() => {
    if (camera) ref.current?.setCameraPosition(camera);
  }, [camera]);

  const pins = days.flatMap((stops, day) =>
    stops
      // `revealed` counts located stops, so compare each pin's place among
      // them, not its place in the day: a stop Apple could not place has no
      // pin and must not hold back the ones after it.
      .filter((_, located) => day !== activeDay || located < revealed)
      .map((s) => {
        const at: StopRef = { day, stop: s.index };
        const isSelected = selected?.day === day && selected.stop === s.index;
        const color = dayColor(day);
        return {
          id: pinId(at),
          coordinates: s.coordinates,
          title: s.stop.name,
          text: String(s.index + 1),
          backgroundColor: isSelected
            ? theme.colors.foreground
            : day === activeDay
              ? color
              : `${color}${FADED_ALPHA}`,
          textColor: isSelected ? color : theme.colors.onTint,
        };
      }),
  );

  const route = active.slice(0, revealed).map((s) => s.coordinates);

  if (process.env.EXPO_OS === "ios") {
    return (
      <AppleMaps.View
        ref={ref}
        style={styles.map}
        cameraPosition={camera}
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
                  color: dayColor(activeDay),
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
          ? [{ coordinates: route, color: dayColor(activeDay), width: 8 }]
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

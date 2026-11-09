import { Chip } from "@/components/trip-planner/chip";
import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { withAlpha } from "@/lib/color";
import { moveCamera } from "@/lib/map-camera";
import { t, useAppLocale } from "@/lib/i18n";
import { useMapPinClusters } from "@/lib/use-map-pin-clusters";
import { fitCamera, type LatLng } from "@/lib/trip";
import { dayColor, planPins } from "@/lib/trip-planner";
import type { TripPlanDetail, TripPlanStop } from "@convex/model/tripPlan";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const FADED = 0.35;
const STAY_ID = "stay";

type Props = {
  /** Only each stop's name and point are drawn, so a date's evening can use the map too. */
  days: readonly Pick<TripPlanStop, "name" | "lat" | "lng">[][];
  stay: TripPlanDetail["stay"];
  /** The day in focus, or null for the whole trip. */
  activeDay: number | null;
  height: number;
  /** A pin or a day chip picked a day; null is the "All days" chip. */
  onSelectDay: (day: number | null) => void;
  /** The map and its chip row together, which stay pinned over the list. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * Under the map: "All days" and one chip per day in that day's colour, so the whole trip is
 * one tap away. The row sits below the map, never over it, so Apple's logo and Legal link stay
 * visible.
 */
function DayChips({
  dayCount,
  activeDay,
  onSelectDay,
}: {
  dayCount: number;
  activeDay: number | null;
  onSelectDay: (day: number | null) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chips}
      contentContainerStyle={styles.chipRow}
    >
      {/* Ink, not amber, when picked: the amber fill read as day 1's orange. */}
      <Chip
        label={t("tripPlanner.allDays")}
        selected={activeDay === null}
        pick="radio"
        fill={{
          background: theme.colors.foreground,
          foreground: theme.colors.background,
        }}
        onPress={() => onSelectDay(null)}
      />
      {Array.from({ length: dayCount }, (_, day) => {
        // The day's colour: a dot while off, the whole fill once picked.
        const color = dayColor(day, theme.colors.tripDays);
        return (
          <Chip
            key={day}
            label={t("trip.dayTab", { day: String(day + 1) })}
            selected={activeDay === day}
            pick="radio"
            fill={{ background: color, foreground: theme.colors.onTripDay }}
            dot={color}
            onPress={() => onSelectDay(day)}
          />
        );
      })}
    </ScrollView>
  );
}

export function TripPlannerMap({
  days,
  stay,
  activeDay,
  height,
  onSelectDay,
  onLayout,
}: Props) {
  useAppLocale();
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const [focusedPin, setFocusedPin] = useState<{
    id: string;
    day: number | null;
  } | null>(null);
  if (focusedPin && focusedPin.day !== activeDay) setFocusedPin(null);
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
  const showChips = days.length > 1;
  // Room under the lowest pin for its name label (a focused day's pins carry one).
  const bottom = theme.gap(4);
  const camera = useMemo(() => {
    const chosen =
      focusedPin?.id === STAY_ID
        ? stayPoint
        : pins.find((pin) => pin.id === focusedPin?.id)?.coordinates;
    const focused = pins.filter((pin) => pin.active).map((p) => p.coordinates);
    const all = pins.map((pin) => pin.coordinates);
    const points = chosen
      ? [chosen]
      : focused.length > 0
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
      bottom,
      ...(process.env.EXPO_OS === "ios"
        ? {
            worldWidth: width,
            centerY: rt.insets.top + (height - rt.insets.top) / 2,
          }
        : { worldWidth: 256, centerY: height / 2 }),
    });
  }, [pins, stayPoint, width, height, top, bottom, rt.insets.top, focusedPin]);

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
  // Every day keeps its own colour; days out of focus fade to it at a third.
  const colorOf = (day: number, active: boolean) => {
    const color = dayColor(day, theme.colors.tripDays);
    return active ? color : withAlpha(color, FADED);
  };
  const routeColor = (day: number) =>
    colorOf(day, activeDay === null || activeDay === day);
  const select = (id: string | undefined) => {
    if (id === STAY_ID) {
      setFocusedPin({ id, day: activeDay });
      return;
    }
    const day = pins.find((pin) => pin.id === id)?.day;
    if (day !== undefined && id) {
      setFocusedPin({ id, day });
      onSelectDay(day);
    }
  };

  const visiblePins =
    process.env.EXPO_OS === "ios" || activeDay === null
      ? pins
      : pins.filter((pin) => pin.active);
  const clustered = useMapPinClusters(
    [
      ...visiblePins.map((pin) => ({
        id: pin.id,
        name: `${t("trip.dayTab", { day: String(pin.day + 1) })} · ${Number(pin.id.split(":")[1]) + 1}. ${pin.name}`,
        title: pin.title,
        text: pin.text,
        lat: pin.coordinates.latitude,
        lng: pin.coordinates.longitude,
        tintColor: colorOf(pin.day, pin.active),
      })),
      ...(stayPoint && stay
        ? [
            {
              id: STAY_ID,
              name: stay.name,
              emoji: "🛏️",
              lat: stayPoint.latitude,
              lng: stayPoint.longitude,
              tintColor: theme.colors.foreground,
            },
          ]
        : []),
    ],
    (id) => select(id),
    {
      selectedId: null,
      clusterText: (count) => `×${count}`,
      clearSelection: () => ref.current?.selectMarker(undefined),
    },
  );

  const chips = showChips ? (
    <DayChips
      dayCount={days.length}
      activeDay={activeDay}
      onSelectDay={(day) => {
        setFocusedPin(null);
        onSelectDay(day);
      }}
    />
  ) : null;

  if (process.env.EXPO_OS === "ios") {
    return (
      <View style={styles.header} onLayout={onLayout}>
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
            markers={clustered.markers}
            polylines={routes.map((route) => ({
              id: `route-${route.day}`,
              coordinates: route.coordinates,
              color: routeColor(route.day),
              width: activeDay === route.day ? 4 : 3,
            }))}
            onMarkerClick={(pin) => clustered.select(pin.id)}
            onCameraMove={({ zoom }) => clustered.trackZoom(zoom)}
          />
        </View>
        {chips}
        {clustered.sheet}
      </View>
    );
  }

  return (
    <View style={styles.header} onLayout={onLayout}>
      <View style={[styles.map, { height }]}>
        <GoogleMaps.View
          style={StyleSheet.absoluteFill}
          cameraPosition={camera}
          markers={clustered.markers}
          polylines={routes.map((route) => ({
            coordinates: route.coordinates,
            color: routeColor(route.day),
            width: activeDay === route.day ? 10 : 7,
          }))}
          onMarkerClick={(marker) => clustered.select(marker.id)}
          onCameraMove={({ zoom }) => clustered.trackZoom(zoom)}
        />
      </View>
      {chips}
      {clustered.sheet}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: { width: "100%", backgroundColor: theme.colors.background },
  map: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  chips: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  chipRow: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(1),
  },
}));

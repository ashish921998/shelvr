import { Chip } from "@/components/trip-planner/chip";
import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { moveCamera } from "@/lib/map-camera";
import { t, useAppLocale } from "@/lib/i18n";
import { useMapPinClusters } from "@/lib/use-map-pin-clusters";
import { fitCamera, type LatLng } from "@/lib/trip";
import { dayColor, planPins } from "@/lib/trip-planner";
import { distanceKm } from "@convex/model/trip";
import type { TripPlanDetail, TripPlanStop } from "@convex/model/tripPlan";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const STAY_ID = "stay";
const STAY_FIT_RADIUS_KM = 30;
const FOCUSED_MAP_STYLE = {
  json: JSON.stringify([
    { featureType: "poi", stylers: [{ visibility: "off" }] },
  ]),
};

const pinKey = ({
  day,
  name,
  coordinates,
}: ReturnType<typeof planPins>[number]) =>
  JSON.stringify([day, name, coordinates.latitude, coordinates.longitude]);

type Props = {
  /** Only each stop's name and point are drawn, so a date's evening can use the map too. */
  days: readonly Pick<TripPlanStop, "name" | "lat" | "lng">[][];
  stay: TripPlanDetail["stay"];
  /** The day in focus, or null for the whole trip. */
  activeDay: number | null;
  height: number;
  embedded?: boolean;
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
  embedded = false,
  onSelectDay,
  onLayout,
}: Props) {
  useAppLocale();
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const [focusedPin, setFocusedPin] = useState<{
    key: string;
    day: number | null;
  } | null>(null);
  if (focusedPin && focusedPin.day !== activeDay) setFocusedPin(null);
  const pins = useMemo(
    () => planPins(days, activeDay).filter((pin) => pin.active),
    [days, activeDay],
  );
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
  const insetTop = embedded ? 0 : rt.insets.top;
  const top = insetTop + theme.gap(embedded ? 3 : 6);
  const showChips = !embedded && days.length > 1;
  const hideBasePoints = embedded && activeDay !== null;
  // Room under the lowest pin for its name label (a focused day's pins carry one).
  const bottom = theme.gap(4);
  const camera = useMemo(() => {
    const chosen =
      focusedPin?.key === STAY_ID
        ? stayPoint
        : pins.find((pin) => pinKey(pin) === focusedPin?.key)?.coordinates;
    const nearbyStay =
      stayPoint &&
      (activeDay === null ||
        pins.length === 0 ||
        pins.some(
          ({ coordinates }) =>
            distanceKm(
              { lat: coordinates.latitude, lng: coordinates.longitude },
              { lat: stayPoint.latitude, lng: stayPoint.longitude },
            ) <= STAY_FIT_RADIUS_KM,
        ));
    const points = chosen
      ? [chosen]
      : [
          ...pins.map((pin) => pin.coordinates),
          ...(nearbyStay ? [stayPoint] : []),
        ];
    return fitCamera(points, {
      width,
      height,
      top,
      bottom,
      ...(process.env.EXPO_OS === "ios"
        ? {
            worldWidth: width,
            centerY: insetTop + (height - insetTop) / 2,
          }
        : { worldWidth: 256, centerY: height / 2 }),
    });
  }, [
    pins,
    stayPoint,
    activeDay,
    width,
    height,
    top,
    bottom,
    insetTop,
    focusedPin,
  ]);

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
    .filter(
      (route) =>
        (activeDay === null || route.day === activeDay) &&
        route.coordinates.length >= 2,
    );
  const colorOf = (day: number) => dayColor(day, theme.colors.tripDays);
  const select = (id: string | undefined) => {
    if (id === STAY_ID) {
      setFocusedPin({ key: id, day: activeDay });
      return;
    }
    const pin = pins.find((candidate) => candidate.id === id);
    if (pin) {
      setFocusedPin({ key: pinKey(pin), day: pin.day });
      onSelectDay(pin.day);
    }
  };

  const clustered = useMapPinClusters(
    [
      ...pins.map((pin) => ({
        id: pin.id,
        name: `${t("trip.dayTab", { day: String(pin.day + 1) })} · ${Number(pin.id.split(":")[1]) + 1}. ${pin.name}`,
        title: pin.title,
        text: pin.text,
        lat: pin.coordinates.latitude,
        lng: pin.coordinates.longitude,
        tintColor: colorOf(pin.day),
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
            properties={
              hideBasePoints
                ? { pointsOfInterest: { including: [] } }
                : undefined
            }
            uiSettings={{
              compassEnabled: false,
              myLocationButtonEnabled: false,
            }}
            markers={clustered.markers}
            polylines={routes.map((route) => ({
              id: `route-${route.day}`,
              coordinates: route.coordinates,
              color: colorOf(route.day),
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
          properties={
            hideBasePoints ? { mapStyleOptions: FOCUSED_MAP_STYLE } : undefined
          }
          markers={clustered.markers}
          polylines={routes.map((route) => ({
            coordinates: route.coordinates,
            color: colorOf(route.day),
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

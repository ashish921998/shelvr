import { Chip } from "@/components/trip-planner/trip-planner-form";
import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { withAlpha } from "@/lib/color";
import { moveCamera } from "@/lib/map-camera";
import { t } from "@/lib/i18n";
import { fitCamera, type LatLng } from "@/lib/trip";
import { dayColor, pinDay, planPins } from "@/lib/trip-planner";
import type { TripPlanDetail } from "@convex/model/tripPlan";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const FADED = 0.35;
const STAY_ID = "stay";

type Props = {
  days: TripPlanDetail["days"];
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
        tone="ink"
        onPress={() => onSelectDay(null)}
      />
      {Array.from({ length: dayCount }, (_, day) => (
        <Chip
          key={day}
          label={t("trip.dayTab", { day: String(day + 1) })}
          selected={activeDay === day}
          pick="radio"
          swatch={{
            color: dayColor(day, theme.colors.tripDays),
            on: theme.colors.onTripDay,
          }}
          onPress={() => onSelectDay(day)}
        />
      ))}
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
  const showChips = days.length > 1;
  // Room under the lowest pin for its name label (a focused day's pins carry one).
  const bottom = theme.gap(4);
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
      bottom,
      ...(process.env.EXPO_OS === "ios"
        ? {
            worldWidth: width,
            centerY: rt.insets.top + (height - rt.insets.top) / 2,
          }
        : { worldWidth: 256, centerY: height / 2 }),
    });
  }, [pins, stayPoint, width, height, top, bottom, rt.insets.top]);

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
    const day = pinDay(id);
    if (day !== null) onSelectDay(day);
  };

  const chips = showChips ? (
    <DayChips
      dayCount={days.length}
      activeDay={activeDay}
      onSelectDay={onSelectDay}
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
            annotations={pins.map((pin) => ({
              id: pin.id,
              coordinates: pin.coordinates,
              // MapKit prints the title under the pin: the name on a focused day, nothing elsewhere.
              title: pin.title,
              text: pin.text,
              backgroundColor: colorOf(pin.day, pin.active),
              textColor: theme.colors.onTripDay,
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
        {chips}
      </View>
    );
  }

  return (
    <View style={styles.header} onLayout={onLayout}>
      <View style={[styles.map, { height }]}>
        <GoogleMaps.View
          style={StyleSheet.absoluteFill}
          cameraPosition={camera}
          markers={[
            // Google's markers cannot fade, so a focused day shows only its own.
            ...pins
              .filter((pin) => activeDay === null || pin.active)
              .map((pin) => ({
                id: pin.id,
                coordinates: pin.coordinates,
                // Shown in the callout a tap opens.
                title: pin.name,
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
      {chips}
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

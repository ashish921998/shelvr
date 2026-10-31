import { Fragment } from "react";
import { Linking, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ThemedText } from "@/components/ui/themed-text";
import { TripStopRow } from "@/components/trip-planner/trip-stop-row";
import { AppSymbolIcon } from "@/components/symbol";
import { Chip } from "@/components/trip-planner/chip";
import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  travelDirections,
  travelSummary,
  useDayTravel,
} from "@/lib/trip-travel";
import { travelLegKey, type TravelMode } from "@convex/model/tripTravel";
import type { TripPlanStop } from "@convex/model/tripPlan";
import type { Id } from "@convex/_generated/dataModel";

export function TravelModePicker({
  mode,
  onChange,
}: {
  mode: TravelMode;
  onChange: (mode: TravelMode) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.controls}>
      <View style={styles.modes}>
        {(["walking", "driving"] as const).map((value) => (
          <Chip
            key={value}
            label={t(
              value === "walking" ? "tripTravel.walking" : "tripTravel.driving",
            )}
            selected={mode === value}
            pick="radio"
            fill={{
              background: theme.colors.primary,
              foreground: theme.colors.onTint,
            }}
            onPress={() => onChange(value)}
          />
        ))}
      </View>
      <ThemedText variant="caption" style={styles.muted}>
        {t("tripTravel.hint")}
      </ThemedText>
    </View>
  );
}

export function TripDayStops({
  tripId,
  day,
  stops,
  mode,
  active,
  color,
  fromSave,
  onOpen,
}: {
  tripId: Id<"tripPlans">;
  day: number;
  stops: TripPlanStop[];
  mode: TravelMode;
  active: boolean;
  color: string;
  fromSave: Set<string>;
  onOpen: (stop: TripPlanStop) => void;
}) {
  const locale = useAppLocale();
  const { theme } = useUnistyles();
  const travel = useDayTravel(tripId, day, stops, mode, active);
  return (
    <>
      {stops.map((stop, index) => {
        const previous = stops[index - 1];
        const estimate = previous
          ? travel.data?.find((leg) => leg.key === travelLegKey(previous, stop))
              ?.estimate
          : undefined;
        const summary = estimate
          ? travelSummary(estimate, locale)
          : travel.isFetching
            ? t("tripTravel.loading")
            : active
              ? t("tripTravel.unavailable")
              : t("tripTravel.directions");
        return (
          <Fragment key={stop._id}>
            {previous ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tripTravel.leg", {
                  from: previous.name,
                  to: stop.name,
                  mode: t(
                    mode === "walking"
                      ? "tripTravel.walking"
                      : "tripTravel.driving",
                  ),
                  summary,
                })}
                onPress={() => {
                  void Linking.openURL(
                    travelDirections(previous, stop, mode),
                  ).catch((error: unknown) =>
                    analytics.captureError(
                      "trip_travel_directions_failed",
                      error,
                    ),
                  );
                }}
                style={({ pressed }) => [styles.leg, pressed && styles.pressed]}
              >
                <AppSymbolIcon
                  name={mode === "walking" ? "figure.walk" : "car.fill"}
                  size={16}
                  tintColor={theme.colors.muted}
                />
                <ThemedText variant="footnote" style={styles.muted}>
                  {summary}
                </ThemedText>
                <AppSymbolIcon
                  name="arrow.up.right"
                  size={12}
                  tintColor={theme.colors.muted}
                />
              </Pressable>
            ) : null}
            <TripStopRow
              stop={stop}
              number={index + 1}
              dayColor={{ color, on: theme.colors.onTripDay }}
              fromSave={fromSave.has(stop._id)}
              onPress={() => onOpen(stop)}
            />
          </Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  controls: { gap: theme.gap(1) },
  modes: { flexDirection: "row", gap: theme.gap(1) },
  muted: { color: theme.colors.muted },
  leg: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingLeft: theme.gap(5),
    paddingVertical: theme.gap(0.5),
  },
  pressed: { opacity: theme.opacity.pressed },
}));

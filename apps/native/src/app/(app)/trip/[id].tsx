import { EmptyState } from "@/components/empty-state";
import { TripBuilding } from "@/components/trip/trip-building";
import { TripDayPanel } from "@/components/trip/trip-day-panel";
import { TripMap, type StopRef } from "@/components/trip/trip-map";
import { TripPlanForm } from "@/components/trip/trip-plan-form";
import { TripStopSheet } from "@/components/trip/trip-stop-sheet";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { usePlaceVisits } from "@/lib/make-plan";
import {
  dayColor,
  directionsUrl,
  locatedStops,
  useBuildTrip,
  type TripRequest,
} from "@/lib/trip";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  SlideInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** The space's covers drifting slowly behind the form while there is no map. */
function CoverBackdrop({ covers }: { covers: string[] }) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    drift.set(
      withRepeat(
        withTiming(1, { duration: 14_000, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [drift, reduced]);
  const up = useAnimatedStyle(() => ({
    transform: [{ translateY: -40 * drift.value }],
  }));
  const down = useAnimatedStyle(() => ({
    transform: [{ translateY: -40 + 40 * drift.value }],
  }));
  const columns = [0, 1, 2].map((c) =>
    covers.filter((_, i) => i % 3 === c).slice(0, 5),
  );
  return (
    <View style={styles.backdrop} pointerEvents="none">
      {columns.map((column, c) => (
        <Animated.View
          key={c}
          style={[styles.backdropColumn, c === 1 ? down : up]}
        >
          {column.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={styles.backdropCover}
              contentFit="cover"
            />
          ))}
        </Animated.View>
      ))}
      <View style={styles.backdropVeil} />
    </View>
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return undefined;
  }
  const data = (error as { data?: unknown }).data;
  return typeof data === "object" && data !== null && "code" in data
    ? String((data as { code: unknown }).code)
    : undefined;
}

export default function TripScreen() {
  const locale = useAppLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const spaceId = id as Id<"spaces">;
  const router = useRouter();
  const { data: space } = useQuery(
    convexQuery(api.spaces.getSpace, { id: spaceId }),
  );
  const { data: trip } = useQuery(
    convexQuery(api.tripData.getSpaceTrip, { spaceId }),
  );
  const { data: cities } = useQuery(
    convexQuery(api.tripData.tripCities, { spaceId }),
  );
  const { state, build, reset } = useBuildTrip(spaceId, locale);
  const swapTripStop = useMutation(api.tripData.swapTripStop);
  const { isVisited, toggle: toggleVisited } = usePlaceVisits();
  const [editing, setEditing] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [selected, setSelected] = useState<StopRef | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);

  const covers = useMemo(
    () =>
      (space?.items ?? []).flatMap((item) => {
        const uri = item.imageUrl ?? item.heroImageUrl;
        return uri ? [uri] : [];
      }),
    [space],
  );

  const dayCount = trip?.days.length ?? 0;
  const day = Math.min(activeDay, Math.max(0, dayCount - 1));
  const hasMap = useMemo(
    () => (trip?.days ?? []).some((d) => locatedStops(d.stops).length > 0),
    [trip],
  );
  const selectedStop =
    selected && trip
      ? trip.days[selected.day]?.stops[selected.stop]
      : undefined;

  if (trip === undefined || space === undefined || cities === undefined) {
    return <ScreenLoader label={t("trip.loading")} />;
  }

  const mode =
    state.status === "building"
      ? "building"
      : state.status !== "idle"
        ? "message"
        : trip === null || editing
          ? "plan"
          : selectedStop
            ? "stop"
            : "days";

  const onBuild = (request: TripRequest) => {
    setLastRequest(request);
    setSelected(null);
    void build(request).then((made) => {
      if (!made) return;
      setEditing(false);
      setActiveDay(0);
      if (process.env.EXPO_OS === "ios") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    });
  };

  const selectStop = (ref: StopRef) => {
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    analytics.capture("trip_stop_opened", { day: ref.day, stop: ref.stop });
    setActiveDay(ref.day);
    setSelected(ref);
  };

  const swap = async () => {
    if (!trip || !selected) return;
    setSwapping(true);
    try {
      await swapTripStop({
        tripId: trip._id,
        day: selected.day,
        stop: selected.stop,
      });
      analytics.capture("trip_stop_swapped", { day: selected.day });
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    } catch (error) {
      if (errorCode(error) !== "nothing_to_swap") {
        analytics.captureError("trip_swap_failed", error);
      }
    } finally {
      setSwapping(false);
    }
  };

  const openDirections = () => {
    if (!selectedStop || !trip) return;
    analytics.capture("trip_directions_opened", {
      located: selectedStop.lat !== undefined,
    });
    Linking.openURL(directionsUrl(selectedStop, trip.city)).catch(
      (error: unknown) =>
        analytics.captureError("trip_directions_failed", error),
    );
  };

  const savedCount = space?.items.length ?? 0;
  const panel = (() => {
    switch (mode) {
      case "building":
        return <TripBuilding covers={covers} />;
      case "message":
        return (
          <View style={styles.message}>
            <EmptyState
              title={
                state.status === "empty"
                  ? t("trip.emptyTitle")
                  : state.status === "ai_off"
                    ? t("trip.make")
                    : t("trip.failedTitle")
              }
              message={
                state.status === "empty"
                  ? t("trip.emptyBody")
                  : state.status === "ai_off"
                    ? t("trip.aiOff")
                    : t("errors.retrySoon")
              }
            />
            {state.status === "ai_off" ? (
              <Button
                title={t("profile.settings")}
                onPress={() => router.push("/settings")}
              />
            ) : (
              <Button
                title={t("common.tryAgain")}
                onPress={() => (lastRequest ? onBuild(lastRequest) : reset())}
              />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              hitSlop={8}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <ThemedText variant="secondaryLabel" style={styles.muted}>
                {t("common.back")}
              </ThemedText>
            </Pressable>
          </View>
        );
      case "plan":
        return (
          <TripPlanForm
            saveCount={savedCount}
            cities={cities}
            initial={
              lastRequest ??
              (trip
                ? {
                    days: trip.days.length,
                    pace: trip.pace,
                    startDate: trip.startDate,
                    city: trip.city,
                  }
                : undefined)
            }
            onBuild={onBuild}
            onCancel={trip ? () => setEditing(false) : undefined}
          />
        );
      case "stop":
        return selectedStop && selected && trip ? (
          <TripStopSheet
            stop={selectedStop}
            index={selected.stop}
            color={dayColor(selected.day)}
            visited={isVisited(selectedStop)}
            canSwap={trip.wishlist.length > 0}
            swapping={swapping}
            onClose={() => setSelected(null)}
            onDirections={openDirections}
            onSwap={() => void swap()}
            onToggleVisited={() => toggleVisited(selectedStop)}
            onOpenSave={() =>
              router.push({
                pathname: "/item/[id]",
                params: { id: selectedStop.itemId },
              })
            }
          />
        ) : null;
      case "days":
        return trip ? (
          <View style={styles.days}>
            <TripDayPanel
              trip={trip}
              activeDay={day}
              onDayChange={(next) => {
                setSelected(null);
                setActiveDay(next);
              }}
              onSelectStop={(stop) => selectStop({ day, stop })}
            />
            <View style={styles.footer}>
              {trip.wishlist.length > 0 ? (
                <ThemedText variant="caption" style={styles.muted}>
                  {t("trip.wishlistCount", { count: trip.wishlist.length })}
                </ThemedText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelected(null);
                  setEditing(true);
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.link,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText variant="secondaryLabel" style={styles.linkText}>
                  {t("trip.change")}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : null;
    }
  })();

  const overMap = hasMap && trip !== null;
  return (
    <View style={styles.screen}>
      {overMap && trip ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.fill}>
          <TripMap
            trip={trip}
            activeDay={day}
            selected={selected}
            onSelect={selectStop}
            onMapPress={() => setSelected(null)}
          />
        </Animated.View>
      ) : (
        <CoverBackdrop covers={covers} />
      )}
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        layout={LinearTransition.springify().damping(22)}
        style={[styles.panel, overMap ? styles.panelOverMap : styles.panelFull]}
      >
        <View style={styles.grabber} />
        <ScrollView
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            key={mode}
            entering={FadeInDown.duration(260).withInitialValues({
              opacity: 0,
              transform: [{ translateY: 16 }],
            })}
            exiting={FadeOut.duration(140)}
          >
            {panel}
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1),
    overflow: "hidden",
  },
  backdropColumn: {
    flex: 1,
    gap: theme.gap(1),
    paddingTop: rt.insets.top,
  },
  backdropCover: {
    width: "100%",
    aspectRatio: 0.75,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  backdropVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
    opacity: 0.55,
  },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    paddingTop: theme.gap(1),
    boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
  },
  panelOverMap: {
    maxHeight: rt.screen.height * 0.56,
  },
  panelFull: {
    maxHeight: rt.screen.height - rt.insets.top - theme.gap(7),
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  panelContent: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1),
    paddingBottom: rt.insets.bottom + theme.gap(2),
  },
  days: {
    gap: theme.gap(2),
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  message: {
    gap: theme.gap(2),
    paddingVertical: theme.gap(2),
  },
  muted: {
    color: theme.colors.muted,
  },
  link: {
    alignSelf: "center",
    paddingVertical: theme.gap(1),
  },
  linkText: {
    color: theme.colors.primaryText,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));

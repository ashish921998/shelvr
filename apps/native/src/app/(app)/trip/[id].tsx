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
import { motion } from "@/lib/motion";
import {
  directionsUrl,
  locatedStops,
  pickedStop,
  TRIP_PANEL_SHARE,
  useBuildTrip,
  type StopPick,
  type TripRequest,
} from "@/lib/trip";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
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

// A module constant, so the worklet captures this timing object and not
// all of `motion`.
const ENTER = motion.timing.enter;

/** Panel content rising into place, by transform only. */
function rise() {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: 12 }] },
    animations: {
      transform: [{ translateY: withTiming(0, ENTER) }],
    },
  };
}

// The panel comes up on the iOS sheet curve; when its content changes height
// it resizes in place, easing both ways. The map fades in under it.
const PANEL_IN = SlideInDown.duration(300).easing(
  Easing.bezier(0.32, 0.72, 0, 1),
);
const PANEL_RESIZE = LinearTransition.duration(motion.duration.enter).easing(
  motion.easing.inOut,
);
const MAP_IN = FadeIn.duration(300).easing(motion.easing.out);
const CONTENT_OUT = FadeOut.duration(140).easing(motion.easing.out);

/** Save covers that scroll slowly behind the form when the trip has no map. */
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
    transform: [{ translateY: -40 * drift.get() }],
  }));
  const down = useAnimatedStyle(() => ({
    transform: [{ translateY: -40 + 40 * drift.get() }],
  }));
  // Covers repeat until each column runs past the sheet, so a space with a
  // few photos still fills the backdrop with no empty band.
  const tiles =
    covers.length === 0
      ? []
      : Array.from({ length: 24 }, (_, i) => covers[i % covers.length]);
  const columns = [0, 1, 2].map((c) => tiles.filter((_, i) => i % 3 === c));
  return (
    <View style={styles.backdrop} pointerEvents="none">
      {columns.map((column, c) => (
        <Animated.View
          key={c}
          style={[styles.backdropColumn, c === 1 ? down : up]}
        >
          {column.map((uri, i) => (
            <Image
              key={i}
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

function isNothingToSwap(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    (error.data as { code?: unknown } | null)?.code === "nothing_to_swap"
  );
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
  // The open stop by its save and name, not its position: a swap puts the
  // day back in time order, so the newcomer can land at another index.
  const [selected, setSelected] = useState<StopPick | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);

  // Unique: two saves from one site often share a cover, and covers key
  // their tiles.
  const covers = useMemo(
    () => [
      ...new Set(
        (space?.items ?? []).flatMap((item) => {
          const uri = item.imageUrl ?? item.heroImageUrl;
          return uri ? [uri] : [];
        }),
      ),
    ],
    [space],
  );

  const dayCount = trip?.days.length ?? 0;
  const day = Math.min(activeDay, Math.max(0, dayCount - 1));
  const hasMap = useMemo(
    () => (trip?.days ?? []).some((d) => locatedStops(d.stops).length > 0),
    [trip],
  );
  const picked = pickedStop(trip?.days, selected);

  // A new trip is stored before its subscription delivers it; until then
  // the screen keeps building rather than flash the form or the old trip.
  const arrived =
    state.status === "arriving" && !!trip && trip._id !== state.previous;
  useEffect(() => {
    if (arrived) reset();
  }, [arrived, reset]);

  if (trip === undefined || space === undefined || cities === undefined) {
    return <ScreenLoader label={t("trip.loading")} />;
  }

  const mode =
    state.status === "building" || (state.status === "arriving" && !arrived)
      ? "building"
      : state.status !== "idle" && !arrived
        ? "message"
        : trip === null || editing
          ? "plan"
          : picked
            ? "stop"
            : "days";

  const onBuild = (request: TripRequest) => {
    setLastRequest(request);
    setSelected(null);
    void build(request, trip?._id ?? null).then((made) => {
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
    const stop = trip?.days[ref.day]?.stops[ref.stop];
    if (!stop) return;
    setActiveDay(ref.day);
    setSelected({ day: ref.day, itemId: stop.itemId, name: stop.name });
  };

  const swap = async () => {
    if (!trip || !picked) return;
    const { day: stopDay } = picked.ref;
    setSwapping(true);
    try {
      const replacement = await swapTripStop({
        tripId: trip._id,
        itemId: picked.view.itemId,
        name: picked.view.name,
      });
      setSelected({ day: stopDay, ...replacement });
      analytics.capture("trip_stop_swapped", { day: stopDay });
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    } catch (error) {
      if (!isNothingToSwap(error)) {
        analytics.captureError("trip_swap_failed", error);
      }
    } finally {
      setSwapping(false);
    }
  };

  const openDirections = () => {
    if (!picked || !trip) return;
    analytics.capture("trip_directions_opened", {
      located: picked.view.lat !== undefined,
    });
    Linking.openURL(directionsUrl(picked.view, trip.city)).catch(
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
        return picked && trip ? (
          <TripStopSheet
            stop={picked.view}
            index={picked.ref.stop}
            visited={isVisited(picked.view)}
            canSwap={trip.wishlist.length > 0}
            swapping={swapping}
            onClose={() => setSelected(null)}
            onDirections={openDirections}
            onSwap={() => void swap()}
            onToggleVisited={() => toggleVisited(picked.view)}
            onOpenSave={() =>
              router.push({
                pathname: "/item/[id]",
                params: { id: picked.view.itemId },
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
      {overMap ? (
        <Animated.View entering={MAP_IN} style={styles.fill}>
          <TripMap
            trip={trip}
            activeDay={day}
            selected={picked?.ref ?? null}
            onSelect={selectStop}
            onMapPress={() => setSelected(null)}
          />
        </Animated.View>
      ) : (
        <CoverBackdrop covers={covers} />
      )}
      <Animated.View
        entering={PANEL_IN}
        layout={PANEL_RESIZE}
        style={[
          styles.panel,
          overMap ? styles.panelOverMap : styles.panelFull,
          // The day list keeps one height, so switching days never makes
          // the sheet jump; a stop sheet is as tall as its content.
          mode === "days" &&
            (overMap ? styles.panelOverMapFixed : styles.panelFullFixed),
        ]}
      >
        <View style={styles.grabber} />
        <ScrollView
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            key={mode}
            // Rises without fading: Liquid Glass (the Build button) does not
            // draw under a parent whose opacity animates from zero.
            entering={rise}
            exiting={CONTENT_OUT}
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
    // Clear of the status bar and the back button.
    paddingTop: rt.insets.top + theme.gap(7),
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
  panelOverMapFixed: {
    height: rt.screen.height * TRIP_PANEL_SHARE,
  },
  panelFullFixed: {
    height: rt.screen.height - rt.insets.top - theme.gap(7),
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

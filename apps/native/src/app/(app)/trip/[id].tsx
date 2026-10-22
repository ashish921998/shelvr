import { EmptyState } from "@/components/empty-state";
import { TripBuilding } from "@/components/trip/trip-building";
import { TripDayPanel } from "@/components/trip/trip-day-panel";
import { TripMap, type StopRef } from "@/components/trip/trip-map";
import { TripPlanForm } from "@/components/trip/trip-plan-form";
import { TripReveal, useTripReveal } from "@/components/trip/trip-reveal";
import { TripStopSheet } from "@/components/trip/trip-stop-sheet";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { usePlaceVisits } from "@/lib/make-plan";
import {
  TRIP_SIDE_PANEL_MARGIN,
  TRIP_SIDE_PANEL_WIDTH,
  useTripSidePanel,
} from "@/lib/wide-layout";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideInDown,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

// Module constant so the worklet captures this timing object, not all of `motion`.
const ENTER = motion.timing.enter;

function rise() {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: 12 }] },
    animations: {
      transform: [{ translateY: withTiming(0, ENTER) }],
    },
  };
}

const PANEL_IN = SlideInDown.duration(300).easing(
  Easing.bezier(0.32, 0.72, 0, 1),
);
const PANEL_RESIZE = LinearTransition.duration(motion.duration.enter).easing(
  motion.easing.inOut,
);
const MAP_IN = FadeIn.duration(300).easing(motion.easing.out);
const CONTENT_OUT = FadeOut.duration(140).easing(motion.easing.out);

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
  const [selected, setSelected] = useState<StopPick | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);
  const built = state.status === "idle" && trip !== null;
  const reveal = useTripReveal(space, cities, lastRequest, built ? trip : null);

  const dayCount = trip?.days.length ?? 0;
  const day = Math.min(activeDay, Math.max(0, dayCount - 1));
  const hasMap = useMemo(
    () => (trip?.days ?? []).some((d) => locatedStops(d.stops).length > 0),
    [trip],
  );
  const picked = pickedStop(trip?.days, selected);

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
    const revealed = reveal.start(space?.items.length ?? 0);
    void build(request, trip?._id ?? null).then((made) => {
      if (!made) {
        reveal.cancel();
        return;
      }
      setEditing(false);
      setActiveDay(0);
      if (!revealed && process.env.EXPO_OS === "ios") {
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
        return <TripBuilding />;
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
          <TripDayPanel
            trip={trip}
            activeDay={day}
            onDayChange={(next) => {
              setSelected(null);
              setActiveDay(next);
            }}
            onSelectStop={(stop) => selectStop({ day, stop })}
          />
        ) : null;
    }
  })();

  const footer =
    mode === "days" && trip ? (
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
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <ThemedText variant="secondaryLabel" style={styles.linkText}>
            {t("trip.change")}
          </ThemedText>
        </Pressable>
      </View>
    ) : null;

  const overMap = hasMap && trip !== null && !reveal.hidesMap;
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
      ) : null}
      {reveal.revealing ? (
        <TripReveal
          covers={reveal.covers}
          count={reveal.count}
          city={reveal.city}
          target={reveal.target}
          ready={built}
          onDone={reveal.end}
        />
      ) : (
        <TripSheet
          overMap={overMap}
          fixed={mode === "days"}
          contentKey={mode}
          footer={footer}
        >
          {panel}
        </TripSheet>
      )}
    </View>
  );
}

function TripSheet({
  overMap,
  fixed,
  contentKey,
  footer,
  children,
}: {
  overMap: boolean;
  fixed: boolean;
  contentKey: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const side = useTripSidePanel() && overMap;
  return (
    <Animated.View
      entering={PANEL_IN}
      layout={PANEL_RESIZE}
      style={
        side
          ? [styles.panel, styles.panelSide]
          : [
              styles.panel,
              styles.panelBottom,
              overMap ? styles.panelOverMap : styles.panelFull,
              fixed &&
                (overMap ? styles.panelOverMapFixed : styles.panelFullFixed),
            ]
      }
    >
      {side ? null : <View style={styles.grabber} />}
      <ScrollView
        contentContainerStyle={[
          styles.panelContent,
          footer !== null && styles.panelContentAboveFooter,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          key={contentKey}
          // Liquid Glass does not draw under a parent whose opacity animates from zero.
          entering={rise}
          exiting={CONTENT_OUT}
        >
          {children}
        </Animated.View>
      </ScrollView>
      {footer}
    </Animated.View>
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
  panel: {
    position: "absolute",
    backgroundColor: theme.colors.background,
    borderCurve: "continuous",
    paddingTop: theme.gap(1),
  },
  panelBottom: {
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
  },
  // A wide, short screen (an unfolded iPhone Duo held sideways) floats the
  // panel at the left so the map keeps its height.
  panelSide: {
    left: rt.insets.left + TRIP_SIDE_PANEL_MARGIN,
    top: rt.insets.top + theme.gap(7),
    bottom: rt.insets.bottom + TRIP_SIDE_PANEL_MARGIN,
    width: TRIP_SIDE_PANEL_WIDTH,
    borderRadius: theme.radius.xl,
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
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
  panelContentAboveFooter: {
    paddingBottom: theme.gap(1),
  },
  footer: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1),
    paddingBottom: rt.insets.bottom + theme.gap(2),
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

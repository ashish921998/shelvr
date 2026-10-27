import { EmptyState } from "@/components/empty-state";
import { AppSymbolIcon } from "@/components/symbol";
import { TripPlannerMap } from "@/components/trip-planner/trip-planner-map";
import { TripStopRow } from "@/components/trip-planner/trip-stop-row";
import { HeaderActionMenu } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { useDeleteTripPlan } from "@/lib/delete-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  dayAtScroll,
  dayColor,
  dayScrollOffset,
  initialDayFocus,
  nextDayFocus,
  opensOverTripsTab,
  scrolledToEnd,
  sharedSaveStops,
  type StopAction,
  stopAction,
  tripBackTitle,
  tripDayLabel,
  tripLengthLine,
  tripStopsLine,
  tripTitle,
} from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanDetail, TripPlanStop } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRoute,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.42;

function DayHeader({
  index,
  startDate,
  stops,
  color,
  active,
  onPress,
}: {
  index: number;
  startDate: string | undefined;
  stops: number;
  /** The day's colour on the map, so the list and its pins and route match up. */
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("tripPlanner.showDay", { day: String(index + 1) })}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.dayHeader, pressed && styles.pressed]}
    >
      <View style={[styles.daySwatch, { backgroundColor: color }]} />
      <View style={styles.dayHeaderText}>
        <ThemedText variant="header" accessibilityRole="header">
          {tripDayLabel(index, startDate)}
        </ThemedText>
        <ThemedText variant="caption" style={styles.muted}>
          {t("trip.stopCount", { count: stops })}
        </ThemedText>
      </View>
      <AppSymbolIcon
        name="map"
        size={18}
        tintColor={active ? theme.colors.primaryText : theme.colors.muted}
      />
    </Pressable>
  );
}

function TripHeader({
  overMap,
  onDelete,
}: {
  overMap: boolean;
  onDelete: () => void;
}) {
  const { theme } = useUnistyles();
  if (Platform.OS === "android") {
    return (
      <Stack.Screen
        options={{
          // Over the map the header floats; without one it needs its own background.
          headerTransparent: overMap,
          headerStyle: overMap
            ? undefined
            : { backgroundColor: theme.colors.background },
          headerRight: () => (
            <HeaderActionMenu
              icon="ellipsis"
              label={t("tripPlanner.tripActions")}
              title={t("tripPlanner.tripActions")}
              actions={[
                {
                  label: t("tripPlanner.delete"),
                  destructive: true,
                  onPress: onDelete,
                },
              ]}
            />
          ),
        }}
      />
    );
  }
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="ellipsis" tintColor={theme.colors.foreground}>
        <Stack.Toolbar.MenuAction icon="trash" destructive onPress={onDelete}>
          {t("tripPlanner.delete")}
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

function hasMapPoints(trip: TripPlanDetail): boolean {
  return (
    trip.days.some((day) => day.length > 0) || trip.stay?.lat !== undefined
  );
}

function useStopOpener() {
  const router = useRouter();
  // A place card's Apple lookup can finish after the person has left; it must not present or navigate then.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        cancelPlaceDetails();
      };
    }, []),
  );
  const run = useCallback(
    (stop: TripPlanStop, first: StopAction) => {
      const go = (action: StopAction): void => {
        if (!focused.current) return;
        switch (action.kind) {
          case "save":
            router.push({
              pathname: "/item/[id]",
              params: { id: action.itemId },
            });
            return;
          case "card":
            // Without a card (an older iOS, or no page at Apple), the save or Maps opens instead.
            void openPlaceDetails(action.appleId, () =>
              go(stopAction(stop, false)),
            );
            return;
          case "maps":
            Linking.openURL(action.url).catch((error: unknown) =>
              analytics.captureError("trip_plan_maps_failed", error),
            );
        }
      };
      go(first);
    },
    [router],
  );
  return useCallback(
    (stop: TripPlanStop) => {
      if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
      const action = stopAction(stop, canOpenPlaceCard(stop.appleId));
      analytics.capture("trip_plan_stop_opened", {
        source: stop.source,
        action: action.kind,
      });
      run(stop, action);
    },
    [run],
  );
}

function TripBody({ trip }: { trip: TripPlanDetail }) {
  const { rt, theme } = useUnistyles();
  const scroll = useRef<ScrollViewInstance>(null);
  // The trip opens on its first day, so the map starts on a handful of pins, not the whole region.
  // A reducer, not a closure over the focused day: a scroll event handled before React re-renders
  // still sees a pick made just before it, so "All days" can never be undone by a stale handler.
  const [focus, dispatch] = useReducer(
    nextDayFocus,
    trip.days,
    initialDayFocus,
  );
  const activeDay = focus.day;
  const contentY = useRef(0);
  const dayY = useRef<number[]>([]);
  // The map and its chip row, pinned over the list; the chip row adds to the map's height.
  const headerHeight = useRef(0);
  const openStop = useStopOpener();
  const hasMap = hasMapPoints(trip);
  const mapHeight = rt.screen.height * MAP_SHARE;
  const stopCount = trip.days.reduce((sum, day) => sum + day.length, 0);
  const savedCount = trip.days
    .flat()
    .filter((stop) => stop.source === "save").length;
  const fromSave = useMemo(
    () => sharedSaveStops([...trip.days.flat(), ...trip.unplanned]),
    [trip.days, trip.unplanned],
  );

  const pick = (day: number | null) => dispatch({ type: "pick", day });

  // A day picked on the map brings its header up under the map; "All days" and a pick in the
  // list leave the list where it is.
  const pickOnMap = (day: number | null) => {
    pick(day);
    const y = day === null ? undefined : dayY.current[day];
    if (y === undefined) return;
    scroll.current?.scrollTo({
      y: dayScrollOffset(
        contentY.current + y,
        headerHeight.current || mapHeight,
        theme.gap(1),
      ),
      animated: true,
    });
  };

  // The day under the pinned map at this scroll position; the reducer decides whether it counts.
  const dayAt = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>): number | null => {
    if (!hasMap) return null;
    const scrollY = nativeEvent.contentOffset.y;
    return dayAtScroll(
      scrollY,
      (headerHeight.current || mapHeight) + theme.gap(2),
      trip.days.map((_, index) => {
        const y = dayY.current[index];
        return y === undefined ? undefined : contentY.current + y;
      }),
      scrolledToEnd(
        scrollY,
        nativeEvent.layoutMeasurement.height,
        nativeEvent.contentSize.height,
      ),
    );
  };

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentInsetAdjustmentBehavior={hasMap ? "never" : "automatic"}
      contentContainerStyle={styles.scrollContent}
      // The map stays pinned while the days scroll under it, so a focused day is always in view.
      stickyHeaderIndices={hasMap ? [0] : undefined}
      // The focused day follows the person's own scrolling only; see `nextDayFocus`.
      onScroll={(event) => dispatch({ type: "scroll", day: dayAt(event) })}
      scrollEventThrottle={32}
      onScrollBeginDrag={() => dispatch({ type: "dragStart" })}
      onScrollEndDrag={(event) =>
        dispatch({ type: "dragEnd", day: dayAt(event) })
      }
      onMomentumScrollBegin={() => dispatch({ type: "momentumStart" })}
      onMomentumScrollEnd={(event) =>
        dispatch({ type: "momentumEnd", day: dayAt(event) })
      }
    >
      {hasMap ? (
        <TripPlannerMap
          days={trip.days}
          stay={trip.stay}
          activeDay={activeDay}
          height={mapHeight}
          onSelectDay={pickOnMap}
          onLayout={({ nativeEvent }) => {
            headerHeight.current = nativeEvent.layout.height;
          }}
        />
      ) : null}
      <View
        style={styles.content}
        onLayout={({ nativeEvent }) => {
          contentY.current = nativeEvent.layout.y;
        }}
      >
        <View style={styles.heading}>
          <ThemedText variant="largeTitle" accessibilityRole="header">
            {tripTitle(trip.city)}
          </ThemedText>
          <ThemedText variant="subhead" style={styles.muted}>
            {tripLengthLine(trip)}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted}>
            {tripStopsLine({ stopCount, savedCount })}
          </ThemedText>
          {trip.stay ? (
            <ThemedText variant="footnote" style={styles.muted}>
              {t("tripPlanner.stayingAt", { name: trip.stay.name })}
            </ThemedText>
          ) : null}
        </View>

        {trip.days.map((stops, index) => (
          <View
            key={`day-${index}`}
            style={styles.day}
            onLayout={({ nativeEvent }) => {
              dayY.current[index] = nativeEvent.layout.y;
            }}
          >
            <DayHeader
              index={index}
              startDate={trip.startDate}
              stops={stops.length}
              color={dayColor(index, theme.colors.tripDays)}
              active={activeDay === index}
              onPress={() => pick(index)}
            />
            {stops.length === 0 ? (
              <ThemedText variant="footnote" style={styles.muted}>
                {t("tripPlanner.emptyDay")}
              </ThemedText>
            ) : (
              stops.map((stop, stopIndex) => (
                <TripStopRow
                  key={stop._id}
                  stop={stop}
                  number={stopIndex + 1}
                  dayColor={{
                    color: dayColor(index, theme.colors.tripDays),
                    on: theme.colors.onTripDay,
                  }}
                  fromSave={fromSave.has(stop._id)}
                  onPress={() => {
                    // The map follows the list: coming back, it shows the day this stop is on.
                    pick(index);
                    openStop(stop);
                  }}
                />
              ))
            )}
          </View>
        ))}

        {trip.unplanned.length > 0 ? (
          <View style={styles.day}>
            <View style={styles.dayHeaderText}>
              <ThemedText variant="header" accessibilityRole="header">
                {t("tripPlanner.unplanned")}
              </ThemedText>
              <ThemedText variant="caption" style={styles.muted}>
                {t("tripPlanner.unplannedHint")}
              </ThemedText>
            </View>
            {trip.unplanned.map((stop) => (
              <TripStopRow
                key={stop._id}
                stop={stop}
                fromSave={fromSave.has(stop._id)}
                onPress={() => openStop(stop)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * The back button's title; without one VoiceOver read the tab group's route name, "(tabs)".
 * Read from this route's place in the stack, by key, and again whenever the stack changes: the
 * first render can see the stack from before the push that added this screen.
 */
function useBackTitleOptions() {
  const locale = useAppLocale();
  const navigation = useNavigation();
  const { key } = useRoute();
  const overTripsTab = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => navigation.addListener("state", onChange),
      [navigation],
    ),
    () => opensOverTripsTab(navigation.getState(), key),
  );
  return useMemo(
    () => ({ headerBackTitle: tripBackTitle(overTripsTab) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t()` reads the locale, so a language change must rebuild the title
    [overTripsTab, locale],
  );
}

export default function TripPlanScreen() {
  useAppLocale();
  const router = useRouter();
  const backOptions = useBackTitleOptions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id as Id<"tripPlans">;
  const trip = useQuery(
    convexQuery(api.tripPlannerData.getTripPlan, { tripId }),
  );
  const deleteTrip = useDeleteTripPlan();

  const data = trip.data;
  const opened = useRef(false);
  useEffect(() => {
    if (!data || opened.current) return;
    opened.current = true;
    const stops = data.days.flat();
    analytics.capture("trip_plan_opened", {
      days: data.dayCount,
      stops: stops.length,
      saved: stops.filter((stop) => stop.source === "save").length,
    });
  }, [data]);

  const backTitle = <Stack.Screen options={backOptions} />;
  if (trip.isError) {
    return (
      <>
        {backTitle}
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      </>
    );
  }
  if (data === undefined) {
    return (
      <>
        {backTitle}
        <ScreenLoader label={t("trip.loading")} />
      </>
    );
  }
  if (data === null) {
    return (
      <View style={styles.screen}>
        {backTitle}
        <EmptyState
          title={t("tripPlanner.goneTitle")}
          message={t("tripPlanner.goneBody")}
        />
      </View>
    );
  }

  return (
    <>
      {backTitle}
      <TripHeader
        overMap={hasMapPoints(data)}
        onDelete={() => deleteTrip(data._id, () => backOrHome(router))}
      />
      <TripBody trip={data} />
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: rt.insets.bottom + theme.gap(4) },
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
  },
  heading: { gap: theme.gap(0.5) },
  muted: { color: theme.colors.muted },
  day: { gap: theme.gap(0.5) },
  dayHeader: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingBottom: theme.gap(0.5),
  },
  dayHeaderText: { flex: 1, gap: theme.gap(0.25) },
  daySwatch: { width: 12, height: 12, borderRadius: 6 },
  pressed: { opacity: theme.opacity.pressed },
}));

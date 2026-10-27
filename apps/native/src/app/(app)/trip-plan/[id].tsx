import { EmptyState } from "@/components/empty-state";
import {
  hasMapPoints,
  TripPlanBody,
} from "@/components/trip-planner/trip-plan-body";
import { HeaderActionMenu } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { useDeleteTripPlan } from "@/lib/delete-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { opensOverTripsTab, tripBackTitle } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRoute,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Platform, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
      <TripPlanBody trip={data} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
}));

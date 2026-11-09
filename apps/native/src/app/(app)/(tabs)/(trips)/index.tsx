import { AccountGoneBoundary } from "@/components/account-gone-boundary";
import { AppSymbolIcon } from "@/components/symbol";
import { TripCard } from "@/components/trip-planner/trip-card";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { useDeleteTripPlan } from "@/lib/delete-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import { api } from "@convex/_generated/api";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { useIsFocused, useRouter } from "expo-router";
import { FlatList, Pressable, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function NoTrips({ onPlan }: { onPlan: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Animated.View entering={fadeIn} style={styles.empty}>
      <View style={styles.emptyIcon}>
        <AppSymbolIcon
          name="airplane"
          size={26}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <ThemedText variant="title" style={styles.center}>
        {t("tripPlanner.emptyTitle")}
      </ThemedText>
      <ThemedText variant="subhead" style={[styles.center, styles.muted]}>
        {t("tripPlanner.emptyBody")}
      </ThemedText>
      <Button
        testID="trips-plan-trip"
        title={t("tripPlanner.planTrip")}
        onPress={onPlan}
      />
    </Animated.View>
  );
}

const PAGE_SIZE = 20;
const SCREEN_INSET = 2.5;
const GRID_GAP = 1.5;

function TripsHeader() {
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("navigation.library")}
        onPress={() => router.navigate("/(app)/(tabs)/(home)")}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="chevron.left"
          size={16}
          tintColor={theme.colors.foreground}
        />
        <ThemedText variant="bodyLabel">{t("navigation.library")}</ThemedText>
      </Pressable>
      <ThemedText variant="displayTitle" accessibilityRole="header">
        {t("tripPlanner.listTitle")}
      </ThemedText>
    </View>
  );
}

function NewTripTile({ onPress }: { onPress: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID="trips-plan-trip"
      accessibilityRole="button"
      accessibilityLabel={t("tripPlanner.planTrip")}
      onPress={onPress}
      style={({ pressed }) => [styles.planTile, pressed && styles.pressed]}
    >
      <View style={styles.planIcon}>
        <AppSymbolIcon
          name="plus"
          size={22}
          weight="semibold"
          tintColor={theme.colors.primaryText}
        />
      </View>
      <ThemedText variant="bodyLabel" style={styles.accent}>
        {t("tripPlanner.planTrip")}
      </ThemedText>
    </Pressable>
  );
}

export default function TripsScreen() {
  const { isAuthenticated } = useConvexAuth();
  return (
    <AccountGoneBoundary signedIn={isAuthenticated}>
      <TripsList signedIn={isAuthenticated} />
    </AccountGoneBoundary>
  );
}

function TripsList({ signedIn }: { signedIn: boolean }) {
  useAppLocale();
  const router = useRouter();
  // listTripPlans answers newest first.
  const trips = usePaginatedQuery(
    api.tripPlannerData.listTripPlans,
    signedIn ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const deleteTrip = useDeleteTripPlan();
  const { width } = useWindowDimensions();
  const { theme } = useUnistyles();
  const tileWidth = (width - theme.gap(SCREEN_INSET * 2 + GRID_GAP)) / 2;
  const planTrip = () => router.push("/new-trip");
  const tiles = trips.results.length > 0 ? [null, ...trips.results] : [];
  // Under the Plan a trip sheet the list is still on screen; hidden from VoiceOver and TalkBack
  // then, so a swipe cannot leave the sheet for the list behind it.
  const focused = useIsFocused();

  if (trips.status === "LoadingFirstPage") {
    return (
      <View style={styles.screen}>
        <TripsHeader />
        <ScreenLoader label={t("tripPlanner.loading")} />
      </View>
    );
  }

  return (
    <View
      style={styles.screen}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? "auto" : "no-hide-descendants"}
    >
      <TripsHeader />
      <FlatList
        data={tiles}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        keyExtractor={(trip) => trip?._id ?? "new-trip"}
        contentContainerStyle={[
          styles.content,
          tiles.length === 0 && styles.contentEmpty,
        ]}
        renderItem={({ item: trip }) => (
          <View style={{ width: tileWidth }}>
            {trip === null ? (
              <NewTripTile onPress={planTrip} />
            ) : (
              <TripCard
                trip={trip}
                onOpen={() =>
                  router.push({
                    pathname: "/trip-plan/[id]",
                    params: { id: trip._id },
                  })
                }
                onDelete={() => deleteTrip(trip._id)}
                onEdit={() =>
                  router.push({
                    pathname: "/trip-plan/[id]",
                    params: { id: trip._id, mode: "edit" },
                  })
                }
              />
            )}
          </View>
        )}
        onEndReached={() => {
          if (trips.status === "CanLoadMore") trips.loadMore(PAGE_SIZE);
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<NoTrips onPlan={planTrip} />}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(SCREEN_INSET),
    paddingTop: rt.insets.top + theme.gap(0.5),
    paddingBottom: theme.gap(1.5),
  },
  back: {
    alignSelf: "flex-start",
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  planTile: {
    aspectRatio: 1.1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.gap(1),
  },
  planIcon: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
  },
  accent: { color: theme.colors.primaryText, textAlign: "center" },
  pressed: { opacity: theme.opacity.pressed },
  columns: { gap: theme.gap(GRID_GAP) },
  content: {
    gap: theme.gap(2.5),
    paddingHorizontal: theme.gap(SCREEN_INSET),
    paddingBottom: rt.insets.bottom + theme.gap(2),
  },
  contentEmpty: { flexGrow: 1, justifyContent: "center" },
  empty: {
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
    marginBottom: theme.gap(0.5),
  },
  center: { textAlign: "center" },
  muted: { color: theme.colors.muted },
}));

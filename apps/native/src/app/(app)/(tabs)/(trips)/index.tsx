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
import { FlatList, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function NoTrips() {
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
    </Animated.View>
  );
}

const PAGE_SIZE = 20;

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
  const sorted = trips.results;
  // Under the Plan a trip sheet the list is still on screen; hidden from VoiceOver and TalkBack
  // then, so a swipe cannot leave the sheet for the list behind it.
  const focused = useIsFocused();

  if (trips.status === "LoadingFirstPage") {
    return <ScreenLoader label={t("tripPlanner.loading")} />;
  }

  return (
    <View
      style={styles.screen}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? "auto" : "no-hide-descendants"}
    >
      <View style={styles.header}>
        <ThemedText
          variant="displayTitle"
          accessibilityRole="header"
          style={styles.title}
        >
          {t("tripPlanner.listTitle")}
        </ThemedText>
        <Button
          testID="trips-plan-trip"
          title={t("tripPlanner.planTrip")}
          onPress={() => router.push("/new-trip")}
          style={styles.planButton}
        />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(trip) => trip._id}
        contentContainerStyle={[
          styles.content,
          sorted.length === 0 && styles.contentEmpty,
        ]}
        renderItem={({ item: trip }) => (
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
        onEndReached={() => {
          if (trips.status === "CanLoadMore") trips.loadMore(PAGE_SIZE);
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={NoTrips}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: rt.insets.top + theme.gap(1.5),
    paddingBottom: theme.gap(2.5),
  },
  title: { flexShrink: 1 },
  planButton: { flexShrink: 1 },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: rt.insets.bottom + theme.gap(12),
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

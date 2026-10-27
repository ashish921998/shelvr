import { EmptyState } from "@/components/empty-state";
import { AppSymbolIcon } from "@/components/symbol";
import { TripCard } from "@/components/trip-planner/trip-card";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { useDeleteTripPlan } from "@/lib/delete-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import { newestFirst } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, View } from "react-native";
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
        style={styles.emptyButton}
      />
    </Animated.View>
  );
}

export default function TripsScreen() {
  useAppLocale();
  const router = useRouter();
  const trips = useQuery(convexQuery(api.tripPlannerData.listTripPlans, {}));
  const deleteTrip = useDeleteTripPlan();
  const sorted = useMemo(() => newestFirst(trips.data ?? []), [trips.data]);
  const plan = () => router.push("/new-trip");

  if (trips.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (trips.data === undefined) {
    return <ScreenLoader label={t("tripPlanner.loading")} />;
  }

  return (
    <FlatList
      style={styles.screen}
      data={sorted}
      keyExtractor={(trip) => trip._id}
      contentInsetAdjustmentBehavior="automatic"
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
        />
      )}
      ListEmptyComponent={<NoTrips onPlan={plan} />}
      ListFooterComponent={
        sorted.length > 0 ? (
          <Button
            testID="trips-plan-another"
            title={t("tripPlanner.planTrip")}
            onPress={plan}
            style={styles.footerButton}
          />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1),
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
  emptyButton: { alignSelf: "stretch", marginTop: theme.gap(1) },
  footerButton: { marginTop: theme.gap(1.5) },
}));

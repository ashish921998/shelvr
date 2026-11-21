import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { tripName } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const PAGE_SIZE = 10;

class SharedTripsBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    analytics.captureError("shared_trips_load_failed", error);
  }

  render() {
    return this.state.failed ? (
      <View style={styles.section}>
        <ThemedText variant="footnote" style={styles.muted}>
          {t("tripShare.manage")}
        </ThemedText>
        <Button
          title={t("common.retry")}
          onPress={() => this.setState({ failed: false })}
        />
      </View>
    ) : (
      this.props.children
    );
  }
}

function SharedTripsList() {
  const router = useRouter();
  const trips = usePaginatedQuery(
    api.tripShares.listSharedTrips,
    {},
    {
      initialNumItems: PAGE_SIZE,
    },
  );
  if (trips.results.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText variant="footnote" style={styles.muted}>
        {t("tripShare.manage")}
      </ThemedText>
      {trips.results.map((trip) => (
        <Button
          key={trip._id}
          title={tripName(trip)}
          onPress={() =>
            router.push({
              pathname: "/trip-plan/[id]",
              params: { id: trip._id },
            })
          }
        />
      ))}
      {trips.status === "CanLoadMore" ? (
        <Button
          title={t("tripShare.more")}
          onPress={() => trips.loadMore(PAGE_SIZE)}
        />
      ) : null}
    </View>
  );
}

export function SharedTripsSection() {
  return (
    <SharedTripsBoundary>
      <SharedTripsList />
    </SharedTripsBoundary>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    alignSelf: "stretch",
    gap: theme.gap(1.5),
    paddingBottom: theme.gap(3),
  },
  muted: { textAlign: "center", color: theme.colors.muted },
}));

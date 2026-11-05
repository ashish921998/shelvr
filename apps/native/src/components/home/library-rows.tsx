import { HomeRow } from "@/components/home/home-row";
import { useHomeFeed } from "@/lib/home-feed";
import { t } from "@/lib/i18n";
import { countLabel } from "@/lib/save-list";
import { api } from "@convex/_generated/api";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { useRouter } from "expo-router";

const TRIPS_COUNTED = 50;

export function LibraryRows() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { items, canLoadMore, loadingMore } = useHomeFeed();
  const trips = usePaginatedQuery(
    api.tripPlannerData.listTripPlans,
    isAuthenticated ? {} : "skip",
    { initialNumItems: TRIPS_COUNTED },
  );
  const allSaves = t("homePlaces.allSaves");
  const saveCount = countLabel(items?.length ?? 0, canLoadMore || loadingMore);
  const tripsTitle = t("navigation.trips");
  const tripCount =
    trips.status === "LoadingFirstPage"
      ? undefined
      : countLabel(trips.results.length, trips.status !== "Exhausted");
  return (
    <>
      <HomeRow
        icon="square.grid.2x2.fill"
        title={allSaves}
        value={saveCount}
        label={`${allSaves}, ${saveCount}`}
        onPress={() => router.push("/saves")}
      />
      <HomeRow
        icon="suitcase.fill"
        title={tripsTitle}
        value={tripCount}
        label={
          tripCount === undefined ? tripsTitle : `${tripsTitle}, ${tripCount}`
        }
        onPress={() => router.navigate("/(app)/(tabs)/(trips)")}
      />
    </>
  );
}

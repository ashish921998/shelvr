import { HomeRow } from "@/components/home/home-row";
import { useHomeFeed } from "@/lib/home-feed";
import { t } from "@/lib/i18n";
import { countLabel } from "@/lib/save-list";
import { api } from "@convex/_generated/api";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { useRouter } from "expo-router";

const TRIPS_COUNTED = 50;

export function LibraryRows({ cityCount }: { cityCount?: number }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { items, canLoadMore, loadingMore } = useHomeFeed();
  const trips = usePaginatedQuery(
    api.tripPlannerData.listTripPlans,
    isAuthenticated ? {} : "skip",
    { initialNumItems: TRIPS_COUNTED },
  );
  const tripsTitle = t("navigation.trips");
  const tripCount =
    trips.status === "LoadingFirstPage"
      ? undefined
      : countLabel(trips.results.length, trips.status !== "Exhausted");
  const citiesTitle = t("homePlaces.cities");
  const allSaves = t("homePlaces.allSaves");
  const saveCount = countLabel(items?.length ?? 0, canLoadMore || loadingMore);
  return (
    <>
      <HomeRow
        icon="airplane"
        name={tripsTitle}
        count={tripCount}
        onPress={() => router.navigate("/(app)/(tabs)/(trips)")}
      />
      <HomeRow
        icon="book.closed.fill"
        name={t("passport.title")}
        onPress={() => router.navigate("/(app)/(tabs)/(passport)")}
      />
      {cityCount ? (
        <HomeRow
          icon="map.fill"
          name={citiesTitle}
          count={cityCount}
          onPress={() => router.push("/cities")}
        />
      ) : null}
      {items?.length ? (
        <HomeRow
          icon="bookmark.fill"
          name={allSaves}
          count={saveCount}
          onPress={() => router.push("/saves")}
        />
      ) : null}
    </>
  );
}

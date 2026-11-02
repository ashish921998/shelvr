import { AddPlaceSearch, AddPlaceSheet } from "@/components/add-place-sheet";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { inCity, type SharedListDetail } from "@/lib/shared-lists";
import { usePlaceSearch } from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sameTripPlace } from "@convex/model/placeIdentity";
import type { TripPlace } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function onList(detail: SharedListDetail, place: TripPlace): boolean {
  return detail.places.some((row) => sameTripPlace(row, place));
}

function useSavedPlaces(
  detail: SharedListDetail | null | undefined,
  query: string,
) {
  const places = useQuery(
    convexQuery(api.mapPlaces.listMapPlaces, detail?.covered ? {} : "skip"),
  );
  if (!detail) return [];
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (places.data ?? []).filter(
    (place) =>
      detail.cities.some((city) => inCity(place, city)) &&
      !onList(detail, place) &&
      words.every((word) => place.name.toLocaleLowerCase().includes(word)),
  );
}

export default function AddListPlaceScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ listId: string; city?: string }>();
  const listId = params.listId as Id<"sharedLists">;
  const detail = useQuery(
    convexQuery(api.sharedLists.getSharedList, { listId }),
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const city = params.city ?? detail.data?.cities[0] ?? "";
  const searchAction = useAction(api.tripPlanner.searchListPlaces);
  const run = useCallback(
    (text: string) => searchAction({ listId, city, query: text, locale }),
    [searchAction, listId, city, locale],
  );
  const search = usePlaceSearch(
    run,
    detail.data?.covered && city !== "" ? query : "",
  );
  const addFound = useMutation(api.sharedLists.addSharedListPlace);
  const addSave = useMutation(api.sharedLists.addSavePlaces);
  const saved = useSavedPlaces(detail.data, query);
  const close = useCallback(() => backOrHome(router), [router]);
  const data = detail.data;

  const pick = async (from: "search" | "save", add: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await add();
      analytics.capture("shared_list_place_added", { from });
      void haptics.success();
      close();
    } catch (error) {
      analytics.captureError("shared_list_add_failed", error);
      Alert.alert(t("tripPlanner.addFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <AddPlaceSheet onClose={close} />;
  if (!data.covered) {
    return (
      <AddPlaceSheet onClose={close}>
        <View style={styles.content}>
          <ThemedText variant="title">
            {t("sharedLists.notCoveredTitle")}
          </ThemedText>
          <ThemedText variant="body" style={styles.muted}>
            {t("sharedLists.notCoveredBody")}
          </ThemedText>
          <Button
            title={t("planGate.seePlans")}
            onPress={() => void openPaywall(router, "shared_list_search")}
          />
        </View>
      </AddPlaceSheet>
    );
  }

  return (
    <AddPlaceSheet onClose={close}>
      <AddPlaceSearch
        testID="add-list-place-search"
        city={city}
        query={query}
        onQueryChange={setQuery}
        search={search}
        busy={busy}
        addedLabel={t("sharedLists.onList")}
        isAdded={(place) => onList(data, place)}
        onPickFound={(place) =>
          void pick("search", () =>
            addFound({
              listId,
              place: { ...place, city },
            }),
          )
        }
        saved={
          saved.length > 0
            ? {
                rows: saved.map((place) => ({
                  key: `${place.itemId}-${place.name}`,
                  name: place.name,
                  detail: place.city,
                  onPress: () =>
                    void pick("save", () =>
                      addSave({
                        listId,
                        itemId: place.itemId,
                        name: place.name,
                        ...(place.city ? { city: place.city } : {}),
                      }),
                    ),
                })),
              }
            : null
        }
      />
    </AddPlaceSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(4),
  },
  muted: { color: theme.colors.muted },
}));

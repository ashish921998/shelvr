import {
  AddPlaceSearch,
  AddPlaceSection,
  AddPlaceSheet,
} from "@/components/add-place-sheet";
import { Chip } from "@/components/trip-planner/chip";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  editDayLabel,
  matchSavePlaces,
  type NewTripStop,
  onTrip,
  useAddTripStop,
  useTripPlaceSearch,
} from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UNPLANNED_DAY } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { haptics } from "@/lib/haptics";
import { personalPlanAllowed } from "@/lib/list-gate";
import { usePlanGate } from "@/lib/plan-gate";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Add a place: search Apple Maps near the trip, or pick a place from the city's saves. */
export default function AddTripStopScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const params = useLocalSearchParams<{ tripId: string; day?: string }>();
  const tripId = params.tripId as Id<"tripPlans">;
  const trip = useQuery(
    convexQuery(api.tripPlannerData.getTripPlan, { tripId }),
  );
  const { gated } = usePlanGate();
  const saves = useQuery(
    convexQuery(
      api.tripPlannerData.tripSavePlaces,
      gated ? "skip" : { tripId },
    ),
  );
  const asked = Number(params.day);
  const [day, setDay] = useState(Number.isInteger(asked) ? asked : 1);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useTripPlaceSearch(tripId, query, locale);
  const add = useAddTripStop(tripId);
  const close = useCallback(() => backOrHome(router), [router]);
  const data = trip.data;

  const days = useMemo(
    () =>
      data
        ? [
            ...Array.from({ length: data.dayCount }, (_, i) => i + 1),
            UNPLANNED_DAY,
          ]
        : [],
    [data],
  );
  const savePlaces = matchSavePlaces(saves.data ?? [], query);

  const pick = async (place: NewTripStop) => {
    if (busy) return;
    setBusy(true);
    const added = await add(day, place);
    setBusy(false);
    if (!added) return;
    void haptics.success();
    close();
  };

  if (data && !personalPlanAllowed(gated, data.listId)) {
    return <Redirect href="/plan-gate" />;
  }
  if (!data) return <AddPlaceSheet onClose={close} />;

  const fill = {
    background: theme.colors.primary,
    foreground: theme.colors.onTint,
  };

  return (
    <AddPlaceSheet onClose={close}>
      <AddPlaceSearch
        testID="add-trip-stop-search"
        city={data.city}
        query={query}
        onQueryChange={setQuery}
        search={search}
        busy={busy}
        addedLabel={t("tripPlanner.onTrip")}
        isAdded={(place) => onTrip(data, place)}
        onPickFound={(place) => void pick({ kind: "search", place })}
        saved={
          gated
            ? null
            : {
                ...(saves.data?.length === 0
                  ? { note: t("tripPlanner.noSavesLeft") }
                  : {}),
                rows: savePlaces.map((place) => ({
                  key: `${place.itemId}-${place.name}`,
                  name: place.name,
                  detail: place.title,
                  onPress: () =>
                    void pick({
                      kind: "save",
                      itemId: place.itemId,
                      name: place.name,
                    }),
                })),
              }
        }
      >
        <AddPlaceSection title={t("tripPlanner.addTo")}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {days.map((option) => (
              <Chip
                key={option}
                label={editDayLabel(option, data.startDate)}
                selected={option === day}
                pick="radio"
                fill={fill}
                onPress={() => setDay(option)}
              />
            ))}
          </ScrollView>
        </AddPlaceSection>
      </AddPlaceSearch>
    </AddPlaceSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  chips: { gap: theme.gap(1) },
}));

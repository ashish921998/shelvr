import {
  AddPlaceSearch,
  AddPlaceSection,
  AddPlaceSheet,
} from "@/components/add-place-sheet";
import { Chip } from "@/components/trip-planner/chip";
import {
  TripStopSearchMap,
  type StopSearchPin,
} from "@/components/trip-planner/trip-stop-search-map";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  editDayLabel,
  type NewTripStop,
  onTrip,
  tripStopSearchResults,
  useAddTripStop,
  useTripPlaceSearch,
} from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  type TripPlanDetail,
  type TripSavePlace,
  UNPLANNED_DAY,
} from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { haptics } from "@/lib/haptics";
import { personalPlanAllowed } from "@/lib/list-gate";
import { usePlanGate } from "@/lib/plan-gate";
import {
  Redirect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Add a place: search Apple Maps near the trip, or pick a place from the city's saves. */
export default function AddTripStopScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const navigation = useNavigation();
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
  const pending = useRef(false);
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
  const availableSaves = gated ? [] : (saves.data ?? []);
  const results = tripStopSearchResults(availableSaves, query, search);

  const pick = async (place: NewTripStop) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if ((await add(day, place)) && navigation.isFocused()) {
        void haptics.success();
        close();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (data && !personalPlanAllowed(gated, data.listId)) {
    return <Redirect href="/plan-gate" />;
  }
  if (!data) return <AddPlaceSheet onClose={close} />;

  const fill = {
    background: theme.colors.primary,
    foreground: theme.colors.onTint,
  };
  const context = tripSearchContext(data, day);
  const found = results.search.status === "done" ? results.search.places : [];
  const pins: StopSearchPin[] = [
    ...savePins(results.saves),
    ...found.map(
      (place): StopSearchPin => ({
        ...place,
        id: place.appleId ?? `${place.name}-${place.lat}-${place.lng}`,
        source: "search",
      }),
    ),
  ];

  return (
    <AddPlaceSheet onClose={close}>
      <AddPlaceSearch
        testID="add-trip-stop-search"
        city={data.city}
        query={query}
        onQueryChange={setQuery}
        search={results.search}
        mapPreview={
          <TripStopSearchMap
            places={pins}
            context={[...context, ...savePins(availableSaves)]}
          />
        }
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
                rows: results.saves.map((place) => ({
                  key: `${place.itemId}-${place.name}`,
                  name: place.name,
                  detail: place.title === place.name ? undefined : place.title,
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

function savePins(saves: TripSavePlace[]): StopSearchPin[] {
  return saves.flatMap((save) =>
    save.location
      ? [
          {
            ...save.location,
            name: save.name,
            id: `${save.itemId}-${save.name}`,
            source: "save",
          },
        ]
      : [],
  );
}

function tripSearchContext(trip: TripPlanDetail, day: number): StopSearchPin[] {
  const selected =
    day === UNPLANNED_DAY ? trip.unplanned : (trip.days[day - 1] ?? []);
  const stops = selected.length ? selected : trip.days.flat();
  const pins = stops.map(
    (stop): StopSearchPin => ({ ...stop, id: stop._id, source: "trip" }),
  );
  const stay = trip.stay;
  if (stay?.lat !== undefined && stay.lng !== undefined) {
    pins.unshift({
      id: "stay",
      name: stay.name,
      lat: stay.lat,
      lng: stay.lng,
      source: "trip",
    });
  }
  return pins;
}

const styles = StyleSheet.create((theme) => ({
  chips: { gap: theme.gap(1) },
}));

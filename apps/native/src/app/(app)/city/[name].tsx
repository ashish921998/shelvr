import { PlaceMapScreen } from "@/components/city/place-map-screen";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import {
  InviteButton,
  PlanButton,
  ShareMapButton,
} from "@/components/city/plan-button";
import { ProgressBar } from "@/components/city/progress-bar";
import { SaveRow } from "@/components/city/save-row";
import { PlaceRemovalUndo } from "@/components/city/place-removal";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard, openPlaceDetails } from "@/lib/apple-place-card";
import { cityPins, cityRows } from "@/lib/city-pins";
import { useCityPlan } from "@/lib/city-plan";
import { cityProgress, progressLine, visitedPinIds } from "@/lib/city-progress";
import { haptics } from "@/lib/haptics";
import { filterPlaces, mapFilters } from "@/lib/map-filters";
import type { PlaceKind } from "@convex/model/placeKinds";
import { t, useAppLocale } from "@/lib/i18n";
import { usePlaceRemoval } from "@/lib/place-removal";
import { usePlaceCardFocus } from "@/lib/use-place-opener";
import { usePlaceVisit, usePlaceVisits } from "@/lib/use-place-visit";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { sidePadding } from "@/lib/side-insets";

export default function CityScreen() {
  useAppLocale();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const focused = usePlaceCardFocus();
  const city = name ?? "";
  const removal = usePlaceRemoval();
  const placeVisits = usePlaceVisits();
  const { visits } = placeVisits;
  const visit = usePlaceVisit();
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const { busy, start } = useCityPlan();
  const [selected, setSelected] = useState<string | null>(null);
  const loaded = items.data !== undefined;
  const count = items.data?.length ?? 0;

  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || opened.current) return;
    opened.current = true;
    analytics.capture("city_opened", { count });
  }, [loaded, count]);

  // Stable while the query data is, so the map keeps the camera the person moved.
  const allPins = useMemo(() => cityPins(items.data ?? []), [items.data]);
  const [kind, setKind] = useState<PlaceKind | null>(null);
  const filters = useMemo(() => mapFilters(allPins), [allPins]);
  const active = filters.some((filter) => filter.kind === kind) ? kind : null;
  const pins = useMemo(() => filterPlaces(allPins, active), [allPins, active]);
  const visited = useMemo(
    () => visitedPinIds(allPins, visits),
    [allPins, visits],
  );
  const progress = useMemo(
    () => cityProgress(allPins, visited),
    [allPins, visited],
  );
  const progressText = progressLine(progress);
  const [hadPins, setHadPins] = useState(false);
  if (pins.length > 0 && !hadPins) setHadPins(true);
  const rows = useMemo(
    () =>
      cityRows(items.data ?? [], pins).filter(
        (row) => active === null || row.kind === "place",
      ),
    [items.data, pins, active],
  );

  if (items.isError) {
    return (
      <View style={styles.failed}>
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      </View>
    );
  }
  if (items.data === undefined) return <ScreenLoader />;

  return (
    <PlaceMapScreen
      pins={pins}
      hasMap={pins.length > 0 || hadPins}
      rows={rows}
      rowGap={1.5}
      selected={selected}
      visited={visited}
      onSelect={(id) => {
        if (id !== selected) void haptics.selection();
        setSelected(id);
      }}
      header={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {city}
            </Text>
            {allPins.length > 0 ? (
              <ShareMapButton
                disabled={busy !== null}
                onPress={() =>
                  router.push({ pathname: "/city-card", params: { city } })
                }
              />
            ) : null}
            {count > 0 ? (
              <InviteButton
                disabled={busy !== null}
                onPress={() =>
                  router.push({
                    pathname: "/new-shared-list",
                    params: { city },
                  })
                }
              />
            ) : null}
          </View>
          {pins.length > 0 ? (
            <Text style={styles.count}>
              {progressText ??
                t("cityMap.placesFromSaves", { count: allPins.length })}
            </Text>
          ) : null}
          {pins.length > 0 && progressText !== null ? (
            <View style={styles.progress}>
              <ProgressBar value={progress.visited / progress.total} />
            </View>
          ) : null}
          {filters.length > 0 ? (
            <View style={styles.chips}>
              <MapFilterChips
                kinds={filters.map((filter) => filter.kind)}
                selected={active}
                inset={false}
                onSelect={(next) => {
                  setSelected(null);
                  setKind(next);
                }}
              />
            </View>
          ) : null}
        </View>
      }
      renderRow={(row, select) => {
        const { item } = row;
        const appleId = row.kind === "place" ? row.pin.appleId : undefined;
        const went = row.kind === "place" && visited.has(row.id);
        const openSave = () => {
          if (!focused.current) return;
          router.push({
            pathname: "/item/[id]",
            params: { id: item._id },
          });
        };
        return (
          <SaveRow
            item={item}
            placeName={row.kind === "place" ? row.name : undefined}
            emoji={row.kind === "place" ? (row.pin.emoji ?? "📍") : undefined}
            selected={selected === row.id}
            removing={removal.busy}
            visited={went}
            visiting={
              visit.busy || (!placeVisits.loaded && !placeVisits.isError)
            }
            onToggleVisited={
              row.kind !== "place"
                ? undefined
                : placeVisits.loaded
                  ? () => void visit.toggle(item._id, row.pin, !went)
                  : placeVisits.offerRetry
            }
            onRemove={
              row.kind === "place"
                ? () => {
                    setSelected(null);
                    void removal.remove(item._id, row.pin);
                  }
                : undefined
            }
            // First select the place's pin; a second tap opens its source save.
            onPress={
              row.kind === "place" && selected !== row.id
                ? () => select(row.id)
                : openSave
            }
            onPlaceDetails={
              appleId !== undefined && canOpenPlaceCard(appleId)
                ? () => void openPlaceDetails(appleId, openSave)
                : undefined
            }
          />
        );
      }}
      empty={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("cityMap.noPlacesLeft")}</Text>
          <Text style={styles.emptyBody}>
            {t("cityMap.noPlacesLeftBody", { city })}
          </Text>
        </View>
      }
      plans={
        count > 0 ? (
          <>
            <PlanButton
              kind="date"
              busy={busy}
              onPress={() => void start("date", city)}
            />
            <PlanButton
              kind="trip"
              busy={busy}
              onPress={() => void start("trip", city)}
            />
          </>
        ) : null
      }
    >
      <PlaceRemovalUndo removal={removal} />
    </PlaceMapScreen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  failed: {
    flex: 1,
    backgroundColor: theme.colors.background,
    ...sidePadding(rt.insets),
  },
  header: {
    gap: theme.gap(0.25),
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(1.5),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  name: { ...theme.type.largeTitle, color: theme.colors.foreground, flex: 1 },
  count: { ...theme.type.footnote, color: theme.colors.muted },
  progress: { marginTop: theme.gap(0.75) },
  chips: { marginTop: theme.gap(1), marginHorizontal: -theme.gap(0.5) },
  empty: { gap: theme.gap(0.5), paddingTop: theme.gap(0.5) },
  emptyTitle: { ...theme.type.headline, color: theme.colors.foreground },
  emptyBody: { ...theme.type.subhead, color: theme.colors.muted },
}));

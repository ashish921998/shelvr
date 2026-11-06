import { PlaceMapScreen } from "@/components/city/place-map-screen";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { InviteButton, PlanButton } from "@/components/city/plan-button";
import { CityVotes } from "@/components/city/plan-votes-row";
import { SaveRow } from "@/components/city/save-row";
import { PlaceRemovalUndo } from "@/components/city/place-removal";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard, openPlaceDetails } from "@/lib/apple-place-card";
import { cityPins, cityRows } from "@/lib/city-pins";
import { useCityPlan } from "@/lib/city-plan";
import { haptics } from "@/lib/haptics";
import { filterPlaces, mapFilters } from "@/lib/map-filters";
import type { PlaceKind } from "@convex/model/placeKinds";
import { t, useAppLocale } from "@/lib/i18n";
import { usePlaceRemoval } from "@/lib/place-removal";
import { tallyFor, useVoteLink } from "@/lib/plan-votes";
import { usePlaceCardFocus } from "@/lib/use-place-opener";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function CityScreen() {
  useAppLocale();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const focused = usePlaceCardFocus();
  const city = name ?? "";
  const removal = usePlaceRemoval();
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const { busy, start } = useCityPlan();
  const link = useVoteLink(city);
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
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
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
              {t("cityMap.placesFromSaves", { count: allPins.length })}
            </Text>
          ) : null}
          {allPins.length > 0 ? (
            <CityVotes city={city} pins={allPins} filtered={pins} link={link} />
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
            tally={
              row.kind === "place"
                ? tallyFor(link, row.pin, allPins)
                : undefined
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

const styles = StyleSheet.create((theme) => ({
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
  chips: { marginTop: theme.gap(1), marginHorizontal: -theme.gap(0.5) },
  empty: { gap: theme.gap(0.5), paddingTop: theme.gap(0.5) },
  emptyTitle: { ...theme.type.headline, color: theme.colors.foreground },
  emptyBody: { ...theme.type.subhead, color: theme.colors.muted },
}));

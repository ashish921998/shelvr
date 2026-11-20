import { EmptyState } from "@/components/empty-state";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { MapEmpty } from "@/components/map/map-empty";
import { MapHeader, MAP_HEADER_HEIGHT } from "@/components/map/map-header";
import { MapRoundButton } from "@/components/map/map-round-button";
import { MapSearchResults } from "@/components/map/map-search";
import { MapTripPill } from "@/components/map/map-trip-pill";
import { MapWentSwitch } from "@/components/map/map-went-switch";
import {
  type MapFocus,
  type MapPin,
  PlacesMap,
} from "@/components/map/places-map";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { isDarkThemeName } from "@/lib/appearance";
import { framedPins } from "@/lib/city-pins";
import { t, useAppLocale } from "@/lib/i18n";
import {
  busiestCityPlaces,
  filterPlaces,
  mapFilters,
  topSearchResults,
  type WentFilter,
  wentView,
} from "@/lib/map-filters";
import { setMapCityInView } from "@/lib/map-city-in-view";
import { canShowAllCities } from "@/lib/map-city-zoom";
import {
  type DiscoverPlace,
  type MapEntry,
  mapEntries,
  ownOnTop,
  searchEntries,
} from "@/lib/map-discover";
import { useMapLocation } from "@/lib/map-location";
import { useMapCity } from "@/lib/use-map-city";
import { placeEmoji } from "@/lib/map-pin-emoji";
import { useDiscoverPlaces } from "@/lib/use-discover-places";
import { usePlaceVisits } from "@/lib/use-place-visit";
import { visitMatcher } from "@convex/model/placeVisits";
import { api } from "@convex/_generated/api";
import type { PlaceKind } from "@convex/model/placeKinds";
import type { FunctionReturnType } from "convex/server";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type OwnPlace = FunctionReturnType<typeof api.mapPlaces.listMapPlaces>[number];
type Entry = MapEntry<OwnPlace>;

const NO_PLACES: OwnPlace[] = [];
const NO_DISCOVER: DiscoverPlace[] = [];

function placeId(place: {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
}) {
  return `${place.itemId}:${place.name}:${place.lat}:${place.lng}`;
}

function entryId(place: Entry) {
  return place.source === "discover" ? `discover:${place._id}` : placeId(place);
}

function useMapEntries(
  all: OwnPlace[] | undefined,
  went: { selected: WentFilter; places: OwnPlace[] },
  visited: (place: OwnPlace) => boolean,
  kinds: PlaceKind[],
  onToggle: () => void,
) {
  const { settled, beside, open } = useDiscoverPlaces(all ?? NO_PLACES);
  const [on, setOn] = useState(true);
  const showChip =
    went.selected === "all" && (all?.length ?? 0) > 0 && beside.length > 0;
  const discoverShown =
    went.selected === "all" && (on || !showChip) ? beside : NO_DISCOVER;
  const entries = useMemo(
    () => mapEntries(went.places, discoverShown, visited),
    [went.places, discoverShown, visited],
  );
  const filters = useMemo(
    () => mapFilters([...(all ?? NO_PLACES), ...discoverShown]),
    [all, discoverShown],
  );
  const active = useMemo(
    () =>
      kinds.filter((kind) => filters.some((filter) => filter.kind === kind)),
    [kinds, filters],
  );
  const shown = useMemo(() => filterPlaces(entries, active), [entries, active]);
  const anchorEntries = useMemo(() => {
    const own = shown.filter((place) => place.source === "own");
    return own.length > 0 ? own : shown;
  }, [shown]);
  const discover = showChip
    ? {
        on,
        onToggle: () => {
          analytics.capture("map_discover_toggled", { on: !on });
          setOn(!on);
          onToggle();
        },
      }
    : undefined;
  return {
    settled,
    beside,
    openDiscover: open,
    discover,
    filters,
    active,
    shown,
    anchorEntries,
  };
}

export default function MapScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  // A place card's Apple lookup can finish after the user has left; it must not present or navigate then.
  const focused = useRef(false);
  const [opened, setOpened] = useState(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setOpened(true);
      return () => {
        focused.current = false;
        cancelPlaceDetails();
      };
    }, []),
  );
  const places = useQuery(convexQuery(api.mapPlaces.listMapPlaces, {}));
  const location = useMapLocation(opened);
  const [kinds, setKinds] = useState<PlaceKind[]>([]);
  const [filterRevision, setFilterRevision] = useState(0);
  const [searchText, setSearchText] = useState("");
  // Closed once a result is picked, so the map and place card get the room; typing opens it again.
  const [listOpen, setListOpen] = useState(true);
  const [focus, setFocus] = useState<MapFocus | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locate, setLocate] = useState(0);
  const [zoomOut, setZoomOut] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const [stripHeight, setStripHeight] = useState(0);
  const barHeight = useBottomTabBarHeight();

  const all = places.data;
  const { visits, loaded, isError, error, offerRetry } = usePlaceVisits();
  const visitsFailed = isError && !loaded;
  useEffect(() => {
    if (error) analytics.captureError("place_visits_load_failed", error);
  }, [error]);
  useFocusEffect(
    useCallback(() => {
      if (visitsFailed) offerRetry();
    }, [visitsFailed, offerRetry]),
  );
  const visited = useMemo(() => visitMatcher(visits, all ?? []), [visits, all]);
  const [wentFilter, setWentFilter] = useState<WentFilter>("all");
  const went = useMemo(
    () => wentView(all ?? [], wentFilter, visited),
    [all, wentFilter, visited],
  );
  const { city, onCentreChange } = useMapCity(all ?? NO_PLACES);
  const {
    settled,
    beside,
    openDiscover,
    discover,
    filters,
    active,
    shown,
    anchorEntries,
  } = useMapEntries(all, went, visited, kinds, () =>
    setFilterRevision((revision) => revision + 1),
  );
  const searching = searchText.trim() !== "";
  const showWent = went.showSwitch && !searchOpen;
  // Search narrows whatever the filter shows; every match stays on the map, the first few are listed.
  const matches = useMemo(
    () => (searching ? searchEntries(shown, searchText) : shown),
    [searching, shown, searchText],
  );
  const pins: MapPin[] = useMemo(
    () =>
      ownOnTop(matches).map((place) => ({
        ...place,
        id: entryId(place),
        emoji: placeEmoji(place),
        ...(place.source === "discover"
          ? { tintColor: theme.colors.muted }
          : place.visited
            ? {
                tintColor: isDarkThemeName(rt.themeName)
                  ? theme.colors.primarySoft
                  : theme.colors.primaryText,
                title: `✓ ${place.name}`,
              }
            : {}),
      })),
    [matches, rt.themeName, theme],
  );
  const overview = useMemo(
    () => anchorEntries.map((place) => ({ ...place, id: entryId(place) })),
    [anchorEntries],
  );
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  const framed = useMemo(
    () =>
      // As on the city page, a pin far out of town stays on the map but does not set the zoom.
      framedPins(busiestCityPlaces(anchorEntries)).map((place) => ({
        ...place,
        id: entryId(place),
      })),
    [anchorEntries],
  );

  const reported = useRef(false);
  useEffect(() => {
    if (!opened || all === undefined || !settled || location === "asking")
      return;
    if (reported.current) return;
    reported.current = true;
    analytics.capture("map_opened", {
      count: all.length,
      discover: beside.length,
      located: location === "granted",
    });
  }, [opened, all, beside, settled, location]);

  if (places.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (
    all === undefined ||
    (all.length === 0 && !settled) ||
    location === "asking"
  )
    return <ScreenLoader />;
  const hasPlaces = all.length > 0 || beside.length > 0;
  const showStrip = filters.length > 0 || showWent || discover !== undefined;
  const headerBottom = rt.insets.top + MAP_HEADER_HEIGHT;
  const located = location === "granted";
  const select = (id: string) => {
    const place = shown.find((candidate) => entryId(candidate) === id);
    if (!place || !focused.current) return;
    if (place.source === "discover") {
      openDiscover(place);
      return;
    }
    const openSave = () => {
      if (!focused.current) return;
      router.push({ pathname: "/item/[id]", params: { id: place.itemId } });
    };
    const card = place.appleId !== undefined && canOpenPlaceCard(place.appleId);
    analytics.capture("map_place_opened", { card, source: "own" });
    if (card && place.appleId !== undefined) {
      void openPlaceDetails(place.appleId, openSave);
    } else {
      openSave();
    }
  };
  const pickResult = (id: string) => {
    const place = matches.find((candidate) => entryId(candidate) === id);
    if (!place) return;
    Keyboard.dismiss();
    setListOpen(false);
    analytics.capture("map_search_result_opened", {});
    setFocus((previous) => ({
      lat: place.lat,
      lng: place.lng,
      key: (previous?.key ?? 0) + 1,
    }));
    select(id);
  };
  const choose = (next: PlaceKind | null) => {
    setFilterRevision((revision) => revision + 1);
    if (next === null) {
      setKinds([]);
      return;
    }
    setKinds((previous) =>
      previous.includes(next)
        ? previous.filter((kind) => kind !== next)
        : [...previous, next],
    );
    if (!kinds.includes(next))
      analytics.capture("map_filter_selected", { kind: next });
  };

  const cancelSearch = () => {
    setSearchText("");
    setListOpen(true);
    setSearchOpen(false);
    Keyboard.dismiss();
  };

  return (
    <View
      style={styles.container}
      onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
    >
      {mapHeight > 0 ? (
        <PlacesMap
          pins={pins}
          framed={framed}
          anchors={anchorEntries}
          showsUser={located}
          height={mapHeight}
          topInset={headerBottom + theme.gap(1)}
          bottomInset={barHeight + (showStrip ? stripHeight : 0) + theme.gap(1)}
          focus={focus}
          locate={locate}
          overview={overview}
          zoomOut={zoomOut}
          filterRevision={filterRevision}
          onCentreChange={onCentreChange}
          onSelect={select}
        />
      ) : null}
      <MapHeader
        city={city}
        canSearch={hasPlaces}
        searchOpen={searchOpen}
        text={searchText}
        onChangeText={(text) => {
          setSearchText(text);
          setListOpen(true);
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onCancel={cancelSearch}
        onShowAllCities={
          canShowAllCities(city, anchorEntries)
            ? () => setZoomOut((n) => n + 1)
            : undefined
        }
      />
      {searchOpen && listOpen ? (
        <View style={[styles.results, { top: headerBottom }]}>
          <MapSearchResults
            text={searchText}
            total={matches.length}
            results={topSearchResults(matches).map((place) => ({
              id: entryId(place),
              name: place.name,
              city: place.city,
            }))}
            onSelect={pickResult}
          />
        </View>
      ) : null}
      <View
        pointerEvents="box-none"
        style={[styles.aboveBar, { bottom: barHeight }]}
      >
        {!hasPlaces ? (
          <MapEmpty
            located={located}
            onLocate={() => setLocate((n) => n + 1)}
          />
        ) : null}
        <View pointerEvents="box-none" style={styles.controls}>
          <MapTripPill />
          {hasPlaces && located ? (
            <View style={styles.locate}>
              <MapRoundButton
                icon="location"
                label={t("map.showMyLocation")}
                onPress={() => setLocate((n) => n + 1)}
              />
            </View>
          ) : null}
        </View>
        {showStrip ? (
          <View
            style={styles.strip}
            onLayout={(event) =>
              setStripHeight(event.nativeEvent.layout.height)
            }
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityLabel={t("map.filters")}
              contentContainerStyle={styles.filters}
            >
              {showWent ? (
                <MapWentSwitch
                  selected={went.selected}
                  onSelect={(value) => {
                    setWentFilter(value);
                    setFilterRevision((revision) => revision + 1);
                  }}
                />
              ) : null}
              {filters.length > 0 || discover ? (
                <MapFilterChips
                  inline
                  discover={discover}
                  kinds={filters.map((filter) => filter.kind)}
                  selected={active}
                  onSelect={choose}
                />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  results: { position: "absolute", left: theme.gap(2), right: theme.gap(2) },
  aboveBar: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
  },
  locate: { marginLeft: "auto", marginBottom: 10 },
  strip: {
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(1.5),
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
  },
}));

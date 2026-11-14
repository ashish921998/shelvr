import { EmptyState } from "@/components/empty-state";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { MapEmpty } from "@/components/map/map-empty";
import { MapHeader, MAP_HEADER_HEIGHT } from "@/components/map/map-header";
import { MapRoundButton } from "@/components/map/map-round-button";
import { MapSearchResults } from "@/components/map/map-search";
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
  searchPlaces,
  topSearchResults,
  type WentFilter,
  wentView,
} from "@/lib/map-filters";
import { setMapCityInView } from "@/lib/map-city-in-view";
import { canShowAllCities } from "@/lib/map-city-zoom";
import { useMapLocation } from "@/lib/map-location";
import { useMapCity } from "@/lib/use-map-city";
import { placeEmoji } from "@/lib/map-pin-emoji";
import { usePlaceVisits } from "@/lib/use-place-visit";
import { visitMatcher } from "@convex/model/placeVisits";
import { api } from "@convex/_generated/api";
import type { PlaceKind } from "@convex/model/placeKinds";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const NO_PLACES: never[] = [];

function placeId(place: {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
}) {
  return `${place.itemId}:${place.name}:${place.lat}:${place.lng}`;
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
  const [kind, setKind] = useState<PlaceKind | null>(null);
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
  const filters = useMemo(() => mapFilters(went.places), [went.places]);
  // A filter that no longer has enough places (a save was deleted) falls back to All.
  const active = filters.some((filter) => filter.kind === kind) ? kind : null;
  const shown = useMemo(
    () => filterPlaces(went.places, active),
    [went.places, active],
  );
  const searching = searchText.trim() !== "";
  const showWent = went.showSwitch && !searchOpen;
  // Search narrows whatever the filter shows; every match stays on the map, the first few are listed.
  const matches = useMemo(
    () => (searching ? searchPlaces(shown, searchText) : shown),
    [searching, shown, searchText],
  );
  const pins: MapPin[] = useMemo(
    () =>
      matches.map((place) => ({
        ...place,
        id: placeId(place),
        emoji: placeEmoji(place),
        ...(visited(place)
          ? {
              tintColor: isDarkThemeName(rt.themeName)
                ? theme.colors.primarySoft
                : theme.colors.primaryText,
              title: `✓ ${place.name}`,
            }
          : {}),
      })),
    [matches, visited, rt.themeName, theme],
  );
  const overview = useMemo(
    () => shown.map((place) => ({ ...place, id: placeId(place) })),
    [shown],
  );
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  const framed = useMemo(
    () =>
      // As on the city page, a pin far out of town stays on the map but does not set the zoom.
      // Framed from the filter's places, so a filter with none in view can bring them in.
      framedPins(busiestCityPlaces(shown)).map((place) => ({
        ...place,
        id: placeId(place),
      })),
    [shown],
  );

  const reported = useRef(false);
  useEffect(() => {
    if (!opened || all === undefined || location === "asking") return;
    if (reported.current) return;
    reported.current = true;
    analytics.capture("map_opened", {
      count: all.length,
      located: location === "granted",
    });
  }, [opened, all, location]);

  if (places.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (all === undefined || location === "asking") return <ScreenLoader />;
  const headerBottom = rt.insets.top + MAP_HEADER_HEIGHT;
  const located = location === "granted";
  const select = (id: string) => {
    const place = shown.find((candidate) => placeId(candidate) === id);
    if (!place || !focused.current) return;
    const openSave = () => {
      if (!focused.current) return;
      router.push({ pathname: "/item/[id]", params: { id: place.itemId } });
    };
    const card = place.appleId !== undefined && canOpenPlaceCard(place.appleId);
    analytics.capture("map_place_opened", { card });
    if (card && place.appleId !== undefined) {
      void openPlaceDetails(place.appleId, openSave);
    } else {
      openSave();
    }
  };
  const pickResult = (id: string) => {
    const place = matches.find((candidate) => placeId(candidate) === id);
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
    setKind(next);
    if (next !== null) analytics.capture("map_filter_selected", { kind: next });
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
          showsUser={located}
          height={mapHeight}
          topInset={headerBottom + theme.gap(1)}
          bottomInset={
            barHeight +
            (filters.length > 0 || showWent ? stripHeight : 0) +
            theme.gap(1)
          }
          focus={focus}
          locate={locate}
          overview={overview}
          zoomOut={zoomOut}
          onCentreChange={onCentreChange}
          onSelect={select}
        />
      ) : null}
      <MapHeader
        city={city}
        canSearch={all.length > 0}
        searchOpen={searchOpen}
        text={searchText}
        onChangeText={(text) => {
          setSearchText(text);
          setListOpen(true);
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onCancel={cancelSearch}
        onShowAllCities={
          canShowAllCities(city, shown)
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
              id: placeId(place),
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
        {all.length === 0 ? (
          <MapEmpty
            located={located}
            onLocate={() => setLocate((n) => n + 1)}
          />
        ) : null}
        {all.length > 0 && located ? (
          <View style={styles.locate}>
            <MapRoundButton
              icon="location"
              label={t("map.showMyLocation")}
              onPress={() => setLocate((n) => n + 1)}
            />
          </View>
        ) : null}
        {filters.length > 0 || showWent ? (
          <View
            style={styles.strip}
            onLayout={(event) =>
              setStripHeight(event.nativeEvent.layout.height)
            }
          >
            {showWent ? (
              <MapWentSwitch
                selected={went.selected}
                onSelect={setWentFilter}
              />
            ) : null}
            {filters.length > 0 ? (
              <MapFilterChips
                kinds={filters.map((filter) => filter.kind)}
                selected={active}
                onSelect={choose}
              />
            ) : null}
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
  locate: {
    alignSelf: "flex-end",
    marginRight: theme.gap(2.5),
    marginBottom: 10,
  },
  strip: { paddingTop: theme.gap(1), paddingBottom: 13 },
}));

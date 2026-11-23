import { EmptyState } from "@/components/empty-state";
import { MapEmpty } from "@/components/map/map-empty";
import { MapSharedLists } from "@/components/map/map-shared-lists";
import { MapHeader, MAP_HEADER_HEIGHT } from "@/components/map/map-header";
import { MapKindRow } from "@/components/map/map-kind-row";
import { MapRoundButton } from "@/components/map/map-round-button";
import { MapSearchResults } from "@/components/map/map-search";
import { MapTripPill } from "@/components/map/map-trip-pill";
import { MapWentSwitch } from "@/components/map/map-went-switch";
import {
  type MapFocus,
  type MapFrame,
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
import { withAlpha } from "@/lib/color";
import { framedPins } from "@/lib/city-pins";
import type { MapBox } from "@/lib/discover-area";
import { t, useAppLocale } from "@/lib/i18n";
import {
  busiestCityPlaces,
  filterPlaces,
  keepSelected,
  mapRowFilters,
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
import { useAnchors, useHeldFraming } from "@/lib/map-framing";
import { useMapLocation } from "@/lib/map-location";
import { useMapCity } from "@/lib/use-map-city";
import type { OpeningLabel } from "@/lib/map-opening";
import { useMapOpening, useNewSaveFrame } from "@/lib/use-map-opening";
import { placeEmoji } from "@/lib/map-pin-emoji";
import { useDiscoverPlaces } from "@/lib/use-discover-places";
import { usePlaceVisits } from "@/lib/use-place-visit";
import { visitMatcher } from "@convex/model/placeVisits";
import { cityKey } from "@convex/model/trip";
import { api } from "@convex/_generated/api";
import type { PlaceKind } from "@convex/model/placeKinds";
import type { FunctionReturnType } from "convex/server";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
) {
  const [area, setArea] = useState<MapBox | undefined>(undefined);
  const { settled, areaLoaded, areaPartial, beside, open } = useDiscoverPlaces(
    all ?? NO_PLACES,
    area,
  );
  const discoverShown = went.selected === "all" ? beside : NO_DISCOVER;
  const entries = useMemo(
    () => mapEntries(went.places, discoverShown, visited),
    [went.places, discoverShown, visited],
  );
  const chipKinds = useMemo(
    () =>
      keepSelected(
        mapRowFilters([...(all ?? NO_PLACES), ...discoverShown]).map(
          (filter) => filter.kind,
        ),
        kinds,
      ),
    [all, discoverShown, kinds],
  );
  const shown = useMemo(() => filterPlaces(entries, kinds), [entries, kinds]);
  const { anchorEntries, anchors } = useAnchors(shown, areaLoaded);
  return {
    setArea,
    settled,
    areaPartial,
    beside,
    openDiscover: open,
    chipKinds,
    shown,
    anchorEntries,
    anchors,
  };
}

function useFraming(anchorEntries: Entry[], key: string) {
  const live = useMemo(
    () =>
      // As on the city page, a pin far out of town stays on the map but does not set the zoom.
      framedPins(busiestCityPlaces(anchorEntries)).map((place) => ({
        ...place,
        id: entryId(place),
      })),
    [anchorEntries],
  );
  const overview = useMemo(
    () => anchorEntries.map((place) => ({ ...place, id: entryId(place) })),
    [anchorEntries],
  );
  return {
    framed: useHeldFraming(live, key),
    overview,
  };
}

function useSharedCityFrame(all: OwnPlace[] | undefined): MapFrame | undefined {
  const { city, save } = useLocalSearchParams<{
    city?: string;
    save?: string;
  }>();
  return useMemo(() => {
    if (!city || !save || !all) return undefined;
    const places = all.filter(
      (place) => cityKey(place.city ?? "") === cityKey(city),
    );
    return places.length > 0
      ? { key: save, places: framedPins(places) }
      : undefined;
  }, [all, city, save]);
}

function useMapStart(
  all: OwnPlace[] | undefined,
  input: {
    waiting: boolean;
    mapHeight: number;
    located: boolean;
    hasFit: boolean;
    controls: Controls;
  },
) {
  const routeFrame = useSharedCityFrame(all);
  const { frame: saveFrame, close } = useNewSaveFrame(
    all,
    routeFrame !== undefined,
  );
  useCloseOnControl(close, input.controls);
  const opening = useMapOpening(
    !input.waiting && input.mapHeight > 0,
    input.located,
    input.hasFit,
  );
  const label: OpeningLabel | undefined = routeFrame
    ? "frame"
    : saveFrame
      ? "save"
      : opening?.kind;
  return {
    opening,
    frame: routeFrame ?? saveFrame,
    label,
    closeNewSave: close,
  };
}

function useMapOpenedEvent(input: {
  opened: boolean;
  all: OwnPlace[] | undefined;
  discover: number;
  settled: boolean;
  location: "asking" | "granted" | "denied";
  opening: OpeningLabel | undefined;
}) {
  const { opened, all, discover, settled, location, opening } = input;
  const reported = useRef(false);
  useEffect(() => {
    if (
      !opened ||
      all === undefined ||
      !settled ||
      location === "asking" ||
      opening === undefined ||
      reported.current
    )
      return;
    reported.current = true;
    analytics.capture("map_opened", {
      count: all.length,
      discover,
      located: location === "granted",
      opening,
    });
  }, [opened, all, discover, settled, location, opening]);
}

type Controls = {
  focus: MapFocus | undefined;
  locate: number;
  zoomOut: number;
  filterRevision: number;
  searchOpen: boolean;
  went: WentFilter;
};

function useCloseOnControl(close: () => void, controls: Controls) {
  const used =
    controls.focus !== undefined ||
    controls.locate > 0 ||
    controls.zoomOut > 0 ||
    controls.filterRevision > 0 ||
    controls.searchOpen ||
    controls.went !== "all";
  useEffect(() => {
    if (used) close();
  }, [used, close]);
}

function useOnNewKey(key: string | undefined, run: () => void) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (key !== undefined) latest.current();
  }, [key]);
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
  const [overlay, setOverlay] = useState({ strip: 0, lists: 0, controls: 0 });
  const barHeight = useBottomTabBarHeight();

  const all = places.data;
  const { visits, loaded, isError, error, offerRetry } = usePlaceVisits();
  useEffect(() => {
    if (error) analytics.captureError("place_visits_load_failed", error);
  }, [error]);
  useFocusEffect(
    useCallback(() => {
      if (isError && !loaded) offerRetry();
    }, [isError, loaded, offerRetry]),
  );
  const visited = useMemo(() => visitMatcher(visits, all ?? []), [visits, all]);
  const [wentFilter, setWentFilter] = useState<WentFilter>("all");
  const went = useMemo(
    () => wentView(all ?? [], wentFilter, visited),
    [all, wentFilter, visited],
  );
  const { city, onCentreChange } = useMapCity(all ?? NO_PLACES);
  const {
    setArea,
    settled,
    areaPartial,
    beside,
    openDiscover,
    chipKinds,
    shown,
    anchorEntries,
    anchors,
  } = useMapEntries(all, went, visited, kinds);
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
            ? { title: `✓ ${place.name}` }
            : {}),
      })),
    [matches, theme],
  );
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  const waiting =
    all === undefined ||
    (all.length === 0 && !settled) ||
    location === "asking";
  const { framed, overview } = useFraming(
    anchorEntries,
    `${waiting}|${kinds.join(",")}|${went.selected}`,
  );
  const { opening, frame, label, closeNewSave } = useMapStart(all, {
    waiting,
    mapHeight,
    located: location === "granted",
    hasFit: framed.length > 0,
    controls: {
      focus,
      locate,
      zoomOut,
      filterRevision,
      searchOpen,
      went: wentFilter,
    },
  });
  useOnNewKey(frame?.key, () => {
    setKinds([]);
    setWentFilter("all");
    setSearchText("");
    setSearchOpen(false);
    setListOpen(true);
  });

  useMapOpenedEvent({
    opened,
    all,
    discover: beside.length,
    settled,
    location,
    opening: label,
  });

  if (places.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (waiting) return <ScreenLoader />;
  const hasPlaces = all.length > 0 || beside.length > 0;
  const showStrip = chipKinds.length > 0 || showWent;
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
      {opening ? (
        <PlacesMap
          opening={opening}
          pins={pins}
          framed={framed}
          anchors={anchors}
          areaPartial={
            areaPartial &&
            anchorEntries.every((place) => place.source === "discover")
          }
          showsUser={located}
          height={mapHeight}
          topInset={headerBottom + theme.gap(1)}
          bottomInset={
            barHeight +
            (showStrip ? overlay.strip : 0) +
            (all.length === 0 && !searchOpen && overlay.lists > 0
              ? overlay.lists + overlay.controls
              : 0) +
            theme.gap(1)
          }
          searchOpen={searchOpen}
          focus={focus}
          frame={frame}
          locate={locate}
          overview={overview}
          zoomOut={zoomOut}
          filterRevision={filterRevision}
          onCentreChange={onCentreChange}
          onTouch={closeNewSave}
          onSelect={select}
          onArea={setArea}
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
        {all.length === 0 && !searchOpen ? (
          <View
            pointerEvents="box-none"
            onLayout={(event) =>
              setOverlay(withHeight("lists", event.nativeEvent.layout.height))
            }
          >
            {hasPlaces || showStrip ? (
              <MapSharedLists />
            ) : (
              <MapEmpty
                located={located}
                onLocate={() => setLocate((n) => n + 1)}
              />
            )}
          </View>
        ) : null}
        <View
          pointerEvents="box-none"
          style={styles.controls}
          onLayout={(event) =>
            setOverlay(withHeight("controls", event.nativeEvent.layout.height))
          }
        >
          <MapTripPill city={city} />
          {(hasPlaces || showStrip) && located ? (
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
              setOverlay(withHeight("strip", event.nativeEvent.layout.height))
            }
          >
            <View
              pointerEvents="none"
              style={[
                styles.fade,
                {
                  experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0)} 0%, ${withAlpha(theme.colors.background, 0.85)} 35%, ${withAlpha(theme.colors.background, 0.85)} 75%, ${withAlpha(theme.colors.background, 0)} 100%)`,
                },
              ]}
            />
            {showWent ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.went}
              >
                <MapWentSwitch
                  selected={went.selected}
                  onSelect={(value) => {
                    setWentFilter(value);
                    setFilterRevision((revision) => revision + 1);
                  }}
                />
              </ScrollView>
            ) : null}
            {chipKinds.length > 0 ? (
              <MapKindRow
                kinds={chipKinds}
                selected={kinds}
                onSelect={choose}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

type Overlay = { strip: number; lists: number; controls: number };

function withHeight(key: keyof Overlay, height: number) {
  return (overlay: Overlay) =>
    overlay[key] === height ? overlay : { ...overlay, [key]: height };
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
  fade: {
    position: "absolute",
    top: -theme.gap(3),
    bottom: -theme.gap(1),
    left: 0,
    right: 0,
  },
  went: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: theme.gap(0.5),
  },
}));

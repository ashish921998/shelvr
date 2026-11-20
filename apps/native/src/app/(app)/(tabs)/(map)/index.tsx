import { EmptyState } from "@/components/empty-state";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { MapLocateButton } from "@/components/map/map-locate-button";
import { MapSearch } from "@/components/map/map-search";
import { MapWentSwitch } from "@/components/map/map-went-switch";
import {
  type MapFocus,
  type MapPin,
  PlacesMap,
} from "@/components/map/places-map";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { withAlpha } from "@/lib/color";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { isDarkThemeName } from "@/lib/appearance";
import { framedPins } from "@/lib/city-pins";
import type { MapBox } from "@/lib/discover-area";
import { t, useAppLocale } from "@/lib/i18n";
import {
  busiestCityPlaces,
  filterPlaces,
  keepSelected,
  mapFilters,
  topSearchResults,
  type WentFilter,
  wentView,
} from "@/lib/map-filters";
import {
  type MapEntry,
  mapEntries,
  ownOnTop,
  searchEntries,
} from "@/lib/map-discover";
import { useAnchors, useHeldFraming } from "@/lib/map-framing";
import { useMapLocation } from "@/lib/map-location";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type OwnPlace = FunctionReturnType<typeof api.mapPlaces.listMapPlaces>[number];
type Entry = MapEntry<OwnPlace>;

const NO_PLACES: OwnPlace[] = [];

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
  const [locate, setLocate] = useState<number | undefined>(undefined);
  const [area, setArea] = useState<MapBox | undefined>(undefined);

  const all = places.data;
  const {
    settled,
    areaLoaded,
    beside,
    open: openDiscover,
  } = useDiscoverPlaces(all ?? NO_PLACES, area);
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
  const withDiscover = went.selected === "all";
  const entries = useMemo(
    () => mapEntries(went.places, withDiscover ? beside : [], visited),
    [went.places, withDiscover, beside, visited],
  );
  const kinds = useMemo(
    () =>
      keepSelected(
        mapFilters(entries).map((filter) => filter.kind),
        kind,
      ),
    [entries, kind],
  );
  const shown = useMemo(() => filterPlaces(entries, kind), [entries, kind]);
  const searching = searchText.trim() !== "";
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
          ? { tint: theme.colors.muted }
          : place.visited
            ? {
                tint: isDarkThemeName(rt.themeName)
                  ? theme.colors.primarySoft
                  : theme.colors.primaryText,
                snippet: t("passport.wentNoDate"),
              }
            : {}),
      })),
    [matches, rt.themeName, theme],
  );
  const { anchorEntries, anchors } = useAnchors(shown, areaLoaded);
  const liveFraming = useMemo(
    () =>
      // As on the city page, a pin far out of town stays on the map but does not set the zoom.
      // Framed from the filter's places, so a filter with none in view can bring them in.
      framedPins(busiestCityPlaces(anchorEntries)).map((place) => ({
        ...place,
        id: entryId(place),
      })),
    [anchorEntries],
  );
  const waiting =
    all === undefined ||
    (all.length === 0 && !settled) ||
    location === "asking";
  const framed = useHeldFraming(
    liveFraming,
    `${waiting}|${kind ?? ""}|${went.selected}`,
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
  if (waiting) return <ScreenLoader />;
  if (all.length === 0 && beside.length === 0 && area === undefined) {
    return (
      <View style={styles.empty}>
        <EmptyState title={t("map.emptyTitle")} message={t("map.emptyBody")} />
      </View>
    );
  }

  const showChips = kinds.length > 0;
  const top = rt.insets.top + theme.gap(1);
  // The search field, then the chips under it.
  const overlayHeight =
    theme.control.minHeight +
    (went.showSwitch && !searching
      ? theme.gap(1) + theme.control.minHeight
      : 0) +
    (showChips ? theme.gap(1) + theme.control.minHeight : 0);
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
    setKind(next);
    if (next !== null) analytics.capture("map_filter_selected", { kind: next });
  };

  return (
    <View style={styles.container}>
      <PlacesMap
        pins={pins}
        framed={framed}
        anchors={anchors}
        showsUser={location === "granted"}
        topInset={top + overlayHeight}
        focus={focus}
        locate={locate}
        onSelect={select}
        onArea={setArea}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: top + overlayHeight + theme.gap(2),
          // Built in render: Unistyles drops a stylesheet's backgroundImage on theme change.
          experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0.92)} 0%, ${withAlpha(theme.colors.background, 0.6)} 60%, ${withAlpha(theme.colors.background, 0)} 100%)`,
        }}
      />
      <View style={[styles.overlay, { top }]}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <MapSearch
              text={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                setListOpen(true);
              }}
              total={matches.length}
              results={
                searching && listOpen
                  ? topSearchResults(matches).map((place) => ({
                      id: entryId(place),
                      name: place.name,
                      city: place.city,
                    }))
                  : undefined
              }
              onSelect={pickResult}
            />
          </View>
          {location === "granted" ? (
            <MapLocateButton
              onPress={() => setLocate((previous) => (previous ?? 0) + 1)}
            />
          ) : null}
        </View>
        {went.showSwitch && !searching ? (
          <MapWentSwitch selected={went.selected} onSelect={setWentFilter} />
        ) : null}
        {showChips && !searching ? (
          <MapFilterChips kinds={kinds} selected={kind} onSelect={choose} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { flex: 1, backgroundColor: theme.colors.background },
  overlay: { position: "absolute", left: 0, right: 0, gap: theme.gap(1) },
  searchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: theme.gap(2),
  },
  search: { flex: 1, marginRight: -theme.gap(1) },
}));

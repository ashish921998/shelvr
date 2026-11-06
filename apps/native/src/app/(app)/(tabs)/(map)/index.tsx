import { EmptyState } from "@/components/empty-state";
import { BeenMapCard } from "@/components/map/been-map-card";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { MapSearch } from "@/components/map/map-search";
import {
  type MapFocus,
  type MapPin,
  PlacesMap,
} from "@/components/map/places-map";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { withAlpha } from "@/lib/color";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { useMapBeen, useOpenBeenEditor } from "@/lib/been-cities";
import { framedPins } from "@/lib/city-pins";
import { t, useAppLocale } from "@/lib/i18n";
import {
  busiestCityPlaces,
  filterPlaces,
  mapFilters,
  searchPlaces,
  topSearchResults,
} from "@/lib/map-filters";
import { useMapLocation } from "@/lib/map-location";
import { placeEmoji } from "@/lib/map-pin-emoji";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { api } from "@convex/_generated/api";
import type { PlaceKind } from "@convex/model/placeKinds";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Room left at the right of the filter row for MapKit's my-location button. */
const LOCATE_BUTTON_CLEARANCE = 64;

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

  const all = places.data;
  const filters = useMemo(() => mapFilters(all ?? []), [all]);
  // A filter that no longer has enough places (a save was deleted) falls back to All.
  const active = filters.some((filter) => filter.kind === kind) ? kind : null;
  const shown = useMemo(() => filterPlaces(all ?? [], active), [all, active]);
  const searching = searchText.trim() !== "";
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
      })),
    [matches],
  );
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
  const onlyBeen = all !== undefined && all.length === 0;
  const been = useMapBeen(all, onlyBeen || (active === null && !searching));
  const mapPins = useMemo(() => [...pins, ...been.pins], [pins, been.pins]);
  const openEditor = useOpenBeenEditor();
  const { fontScale } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  const reported = useRef(false);
  useEffect(() => {
    if (!opened || all === undefined || location === "asking") return;
    if (been.ids === undefined || reported.current) return;
    reported.current = true;
    analytics.capture("map_opened", {
      count: all.length,
      located: location === "granted",
      been: been.ids.length,
    });
  }, [opened, all, been.ids, location]);

  if (places.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (all === undefined || been.ids === undefined || location === "asking") {
    return <ScreenLoader />;
  }
  if (all.length === 0 && been.ids.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState title={t("map.emptyTitle")} message={t("map.emptyBody")}>
          <Button
            title={t("been.addFromMap")}
            testID="map-add-been"
            onPress={() => openEditor("map", 0)}
          />
        </EmptyState>
      </View>
    );
  }

  const top = rt.insets.top + theme.gap(1);
  const located = location === "granted";
  // The search field, then the chips under it.
  const overlayHeight =
    theme.control.minHeight +
    (filters.length > 0 ? theme.gap(1) + theme.control.minHeight : 0);
  const cardRoom =
    cardHeight ??
    Math.ceil(
      theme.control.minHeight * 2.5 * Math.min(fontScale, HEADLINE_MAX_SCALE),
    );
  const overlayTop = onlyBeen ? cardRoom : overlayHeight;
  const beenCount = been.ids.length;
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

  return (
    <View style={styles.container}>
      <PlacesMap
        pins={mapPins}
        framed={onlyBeen ? been.framed : framed}
        showsUser={located}
        topInset={top + overlayTop}
        focus={focus}
        onSelect={select}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: top + overlayTop + theme.gap(2),
          // Built in render: Unistyles drops a stylesheet's backgroundImage on theme change.
          experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0.92)} 0%, ${withAlpha(theme.colors.background, 0.6)} 60%, ${withAlpha(theme.colors.background, 0)} 100%)`,
        }}
      />
      <View
        style={[
          styles.overlay,
          // Kept clear of MapKit's my-location button in the top right corner, which it would cover.
          { top, right: located ? LOCATE_BUTTON_CLEARANCE : 0 },
        ]}
      >
        {onlyBeen ? (
          <BeenMapCard
            count={beenCount}
            onEdit={() => openEditor("map", beenCount)}
            onLayout={(event) =>
              setCardHeight(Math.ceil(event.nativeEvent.layout.height))
            }
          />
        ) : (
          <>
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
                      id: placeId(place),
                      name: place.name,
                      city: place.city,
                    }))
                  : undefined
              }
              onSelect={pickResult}
            />
            {filters.length > 0 && !searching ? (
              <MapFilterChips
                kinds={filters.map((filter) => filter.kind)}
                selected={active}
                onSelect={choose}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { flex: 1, backgroundColor: theme.colors.background },
  overlay: { position: "absolute", left: 0, gap: theme.gap(1) },
}));

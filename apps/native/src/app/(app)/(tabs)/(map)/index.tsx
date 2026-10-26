import { EmptyState } from "@/components/empty-state";
import { MapFilterChips } from "@/components/map/map-filter-chips";
import { type MapPin, PlacesMap } from "@/components/map/places-map";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { withAlpha } from "@/lib/color";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { t, useAppLocale } from "@/lib/i18n";
import { busiestCityPlaces, filterPlaces, mapFilters } from "@/lib/map-filters";
import { useMapLocation } from "@/lib/map-location";
import { api } from "@convex/_generated/api";
import type { PlaceKind } from "@convex/model/placeKinds";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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

  const all = places.data;
  const filters = useMemo(() => mapFilters(all ?? []), [all]);
  // A filter that no longer has enough places (a save was deleted) falls back to All.
  const active = filters.some((filter) => filter.kind === kind) ? kind : null;
  const shown = useMemo(() => filterPlaces(all ?? [], active), [all, active]);
  const pins: MapPin[] = useMemo(
    () => shown.map((place) => ({ ...place, id: placeId(place) })),
    [shown],
  );
  const framed = useMemo(
    () =>
      busiestCityPlaces(all ?? []).map((place) => ({
        ...place,
        id: placeId(place),
      })),
    [all],
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
  if (all.length === 0) {
    return (
      <View style={styles.empty}>
        <EmptyState title={t("map.emptyTitle")} message={t("map.emptyBody")} />
      </View>
    );
  }

  const chipsTop = rt.insets.top + theme.gap(1);
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
  const choose = (next: PlaceKind | null) => {
    setKind(next);
    if (next !== null) analytics.capture("map_filter_selected", { kind: next });
  };

  return (
    <View style={styles.container}>
      <PlacesMap
        pins={pins}
        framed={framed}
        showsUser={location === "granted"}
        topInset={chipsTop + theme.control.minHeight}
        onSelect={select}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: chipsTop + theme.control.minHeight + theme.gap(2),
          // Built in render: Unistyles drops a stylesheet's backgroundImage on theme change.
          experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0.92)} 0%, ${withAlpha(theme.colors.background, 0.6)} 60%, ${withAlpha(theme.colors.background, 0)} 100%)`,
        }}
      />
      {filters.length > 0 ? (
        <View style={[styles.chips, { top: chipsTop }]}>
          <MapFilterChips
            kinds={filters.map((filter) => filter.kind)}
            selected={active}
            onSelect={choose}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { flex: 1, backgroundColor: theme.colors.background },
  chips: { position: "absolute", left: 0, right: 0 },
}));

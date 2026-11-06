import type { MapPin } from "@/components/map/places-map";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { hasPlaceNear } from "@/lib/map-filters";
import {
  SAMPLE_CITIES,
  isSampleCity,
  type SampleCityId,
} from "@/lib/sample-cities";
import { api } from "@convex/_generated/api";
import { BEEN_CITY_POINTS } from "@convex/model/beenCities";
import { distanceKm, type LatLng } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";

const POINTS: Record<SampleCityId, LatLng> = BEEN_CITY_POINTS;
const BEEN_CLUSTER_KM = 1500;
const BEEN_FRAME_PAD = 0.2;

const NO_CITIES: SampleCityId[] = [];
const NO_PINS: MapPin[] = [];

export function useBeenCities(): {
  ids: SampleCityId[] | undefined;
  error: Error | null;
} {
  const { isAuthenticated } = useConvexAuth();
  const { data, error } = useQuery(
    convexQuery(api.beenCities.listBeenCities, isAuthenticated ? {} : "skip"),
  );
  const ids = useMemo(() => data?.filter(isSampleCity), [data]);
  return { ids, error };
}

export function applyBeenChange(
  current: readonly string[],
  change: { add?: readonly string[]; remove?: readonly string[] },
): string[] {
  const removing = new Set(change.remove ?? []);
  return [...new Set([...current, ...(change.add ?? [])])]
    .filter((id) => !removing.has(id))
    .sort();
}

export function useBeenCityToggle(): (
  city: SampleCityId,
  been: boolean,
  count: number,
) => void {
  const update = useMutation(api.beenCities.updateBeenCities);
  const optimistic = useMemo(
    () =>
      update.withOptimisticUpdate((store, change) => {
        const current = store.getQuery(api.beenCities.listBeenCities, {});
        if (current === undefined) return;
        store.setQuery(
          api.beenCities.listBeenCities,
          {},
          applyBeenChange(current, change),
        );
      }),
    [update],
  );
  return useCallback(
    (city: SampleCityId, been: boolean, count: number) => {
      void optimistic(been ? { add: [city] } : { remove: [city] }).then(
        () => analytics.capture("been_city_changed", { been, count }),
        (error: unknown) => {
          analytics.captureError("been_city_update_failed", error);
          Alert.alert(t("been.saveFailed"), t("errors.connection"));
        },
      );
    },
    [optimistic],
  );
}

export function useOpenBeenEditor(): (
  surface: "profile" | "map",
  count: number,
) => void {
  const router = useRouter();
  return useCallback(
    (surface: "profile" | "map", count: number) => {
      analytics.capture("been_cities_editor_opened", { surface, count });
      router.push("/been-cities");
    },
    [router],
  );
}

export function beenMarkers(
  ids: readonly SampleCityId[],
  places: readonly LatLng[],
): MapPin[] {
  return ids
    .filter((id) => !hasPlaceNear(POINTS[id], places))
    .map((id) => ({
      id: `been:${id}`,
      name: t(SAMPLE_CITIES[id].name),
      lat: POINTS[id].lat,
      lng: POINTS[id].lng,
      been: true,
    }));
}

export function beenFrame(ids: readonly SampleCityId[]): LatLng[] {
  const sorted = [...ids].sort();
  let group: SampleCityId[] = [];
  for (const id of sorted) {
    const near = sorted.filter(
      (other) => distanceKm(POINTS[id], POINTS[other]) <= BEEN_CLUSTER_KM,
    );
    if (near.length > group.length) group = near;
  }
  return group.flatMap((id) => [
    {
      lat: POINTS[id].lat - BEEN_FRAME_PAD,
      lng: POINTS[id].lng - BEEN_FRAME_PAD,
    },
    {
      lat: POINTS[id].lat + BEEN_FRAME_PAD,
      lng: POINTS[id].lng + BEEN_FRAME_PAD,
    },
  ]);
}

export function useMapBeen(
  places: readonly LatLng[] | undefined,
  showMarkers: boolean,
): { ids: SampleCityId[] | undefined; pins: MapPin[]; framed: LatLng[] } {
  const { ids: loaded, error } = useBeenCities();
  useEffect(() => {
    if (error) analytics.captureError("map_been_cities_failed", error);
  }, [error]);
  const ids = error ? NO_CITIES : loaded;
  const framed = useMemo(() => beenFrame(ids ?? NO_CITIES), [ids]);
  const pins = useMemo(
    () =>
      places === undefined || ids === undefined || !showMarkers
        ? NO_PINS
        : beenMarkers(ids, places),
    [ids, places, showMarkers],
  );
  return { ids, pins, framed };
}

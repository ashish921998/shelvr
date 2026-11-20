import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard } from "@/lib/apple-place-card";
import { stopAction } from "@/lib/trip-planner";
import { usePlaceOpener } from "@/lib/use-place-opener";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { type MapBox, WORLD_BOX } from "./discover-area";
import { type DiscoverPlace, discoverBeside } from "./map-discover";

const NONE: DiscoverPlace[] = [];
const AREA_CACHE_MS = 5 * 60 * 1000;

export function useDiscoverPlaces(
  own: readonly { name: string; lat: number; lng: number; appleId?: string }[],
  box: MapBox | undefined,
): {
  settled: boolean;
  areaLoaded: boolean;
  areaPartial: boolean;
  beside: DiscoverPlace[];
  open: (place: DiscoverPlace) => void;
} {
  const query = useQuery({
    ...convexQuery(api.places.inArea, { box: box ?? WORLD_BOX }),
    placeholderData: keepPreviousData,
    gcTime: AREA_CACHE_MS,
  });
  const { open: openWith } = usePlaceOpener(
    stopAction,
    "map_discover_maps_failed",
  );
  useEffect(() => {
    if (query.error)
      analytics.captureError("discover_places_load_failed", query.error);
  }, [query.error]);
  const open = useCallback(
    (place: DiscoverPlace) => {
      const action = stopAction(place, canOpenPlaceCard(place.appleId));
      analytics.capture("map_place_opened", {
        card: action.kind === "card",
        source: "discover",
      });
      openWith(place, action);
    },
    [openWith],
  );
  const areaLoaded =
    box !== undefined && query.isSuccess && !query.isPlaceholderData;
  return useMemo(
    () => ({
      settled: !query.isPending,
      areaLoaded,
      areaPartial: areaLoaded && query.data?.complete === false,
      beside: discoverBeside(own, query.data?.places ?? NONE),
      open,
    }),
    [query.isPending, areaLoaded, query.data, own, open],
  );
}

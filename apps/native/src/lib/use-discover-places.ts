import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { type DiscoverPlace, discoverBeside } from "./map-discover";

const NONE: DiscoverPlace[] = [];

export function useDiscoverPlaces(
  own: readonly { name: string; lat: number; lng: number; appleId?: string }[],
): {
  settled: boolean;
  beside: DiscoverPlace[];
} {
  const query = useQuery(convexQuery(api.places.forMap, {}));
  useEffect(() => {
    if (query.error)
      analytics.captureError("discover_places_load_failed", query.error);
  }, [query.error]);
  return useMemo(
    () => ({
      settled: !query.isPending,
      beside: discoverBeside(own, query.data ?? NONE),
    }),
    [query.isPending, query.data, own],
  );
}

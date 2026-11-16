import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";

export function useHasPlacesToStamp(): boolean {
  const { isAuthenticated } = useConvexAuth();
  const places = useQuery(
    convexQuery(
      api.placeVisits.listUnstampedPlaces,
      isAuthenticated ? {} : "skip",
    ),
  );
  return places.isError || (places.data?.length ?? 0) > 0;
}

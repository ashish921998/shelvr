import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

import { analytics } from "@/lib/analytics";

export function useHasPlacesToStamp(): boolean {
  const { isAuthenticated } = useConvexAuth();
  const places = useQuery(
    convexQuery(
      api.placeVisits.listUnstampedPlaces,
      isAuthenticated ? {} : "skip",
    ),
  );
  useEffect(() => {
    if (places.error) {
      analytics.captureError("passport_unstamped_load_failed", places.error);
    }
  }, [places.error]);
  return places.isError || (places.data?.length ?? 0) > 0;
}

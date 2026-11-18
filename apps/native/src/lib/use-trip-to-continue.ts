import { tripToContinue } from "@/lib/trip-planner";
import { useReportLoadFailure } from "@/lib/use-report-load-failure";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function useTripToContinue() {
  const trips = useQuery(
    convexQuery(api.tripPlannerData.listTripPlans, {
      paginationOpts: { numItems: 50, cursor: null },
    }),
  );
  useReportLoadFailure("map_trips_load_failed", trips);
  return useMemo(
    () => tripToContinue(trips.data?.page ?? [], new Date()),
    [trips.data],
  );
}

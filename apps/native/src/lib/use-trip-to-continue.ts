import {
  CONTINUE_LEAD_DAYS,
  sameCity,
  tripToContinue,
} from "@/lib/trip-planner";
import { MAX_TRIP_DAYS, toDateKey, tripDayDate } from "@/lib/trip";
import { useReportLoadFailure } from "@/lib/use-report-load-failure";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

function msToMidnight(now: Date): number {
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return midnight.getTime() - now.getTime();
}

function useToday(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toDateKey(new Date()));
    const timer = setTimeout(refresh, msToMidnight(new Date()) + 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);
  return today;
}

function dayKey(today: string, offset: number): string {
  const date = tripDayDate(today, offset);
  return date ? toDateKey(date) : today;
}

export function useTripToContinue(city: string | undefined) {
  const today = useToday();
  const trips = useQuery(
    convexQuery(api.tripPlannerData.listTripsStarting, {
      from: dayKey(today, 1 - MAX_TRIP_DAYS),
      to: dayKey(today, CONTINUE_LEAD_DAYS),
    }),
  );
  useReportLoadFailure("map_trips_load_failed", trips);
  return useMemo(
    () =>
      city === undefined
        ? null
        : tripToContinue(
            (trips.data ?? []).filter((trip) => sameCity(trip.city, city)),
            tripDayDate(today, 0) ?? new Date(),
          ),
    [trips.data, today, city],
  );
}

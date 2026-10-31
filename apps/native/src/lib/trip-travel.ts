import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { Platform } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  travelLayout,
  type TravelMode,
  type TravelStop,
  type TravelEstimate,
} from "@convex/model/tripTravel";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";

function layoutChanged(error: unknown): boolean {
  return error instanceof ConvexError && error.data === "trip_layout_changed";
}

export function useDayTravel(
  tripId: Id<"tripPlans">,
  day: number,
  stops: TravelStop[],
  mode: TravelMode,
  active: boolean,
) {
  const estimate = useAction(api.tripTravel.estimateDay);
  const layout = travelLayout(stops);
  return useQuery({
    queryKey: ["trip-travel", tripId, day, layout, mode],
    queryFn: async () => {
      try {
        return await estimate({ tripId, day, layout, mode });
      } catch (error) {
        if (!layoutChanged(error))
          analytics.captureError("trip_travel_failed", error);
        throw error;
      }
    },
    enabled: active && stops.length > 1,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: (failures, error) => failures < 3 && layoutChanged(error),
    retryDelay: 500,
  });
}

export function travelSummary(
  estimate: TravelEstimate,
  locale: string,
): string {
  const minutes = Math.max(1, Math.ceil(estimate.seconds / 60));
  const km = estimate.meters >= 1000;
  const distance = new Intl.NumberFormat(locale, {
    maximumFractionDigits: km ? 1 : 0,
  }).format(km ? estimate.meters / 1000 : estimate.meters);
  const distanceLabel = t(km ? "tripTravel.kilometers" : "tripTravel.meters", {
    distance,
  });
  return `${t("tripTravel.minutes", { count: minutes })} · ${distanceLabel}`;
}

export function travelDirections(
  from: TravelStop,
  to: TravelStop,
  mode: TravelMode,
): string {
  const origin = `${from.lat},${from.lng}`;
  const destination = `${to.lat},${to.lng}`;
  if (Platform.OS === "ios") {
    return `https://maps.apple.com/?${new URLSearchParams({ saddr: origin, daddr: destination, dirflg: mode === "walking" ? "w" : "d" })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin, destination, travelmode: mode })}`;
}

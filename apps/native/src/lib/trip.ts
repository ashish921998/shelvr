import { analytics } from "@/lib/analytics";
import { formattingLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_PLAN_ITEMS } from "@convex/model/plan";
import {
  cityKey,
  STOPS_PER_DAY,
  type TripPace,
  type TripSlot,
} from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

export type { TripPace, TripSlot };
export { MAX_TRIP_DAYS, MIN_TRIP_DAYS } from "@convex/model/trip";

export type Trip = NonNullable<
  FunctionReturnType<typeof api.tripData.getSpaceTrip>
>;
export type TripDayView = Trip["days"][number];
export type TripStopView = TripDayView["stops"][number];

/** Estimates the saves a trip reads: that city's plus those naming no city, capped at MAX_PLAN_ITEMS. */
export function tripSaveCount(
  saveCount: number,
  cities: { city: string; count: number }[],
  city?: string,
): number {
  let count = saveCount;
  if (city !== undefined) {
    const named = cities.reduce((sum, c) => sum + c.count, 0);
    const own = cities.find((c) => c.city === city)?.count ?? 0;
    count = Math.min(saveCount, own + Math.max(0, saveCount - named));
  }
  return Math.min(count, MAX_PLAN_ITEMS);
}

/** The places the city page shows for `city`, read from the list Home already holds. */
export function useCityPlaceCount(
  city: string | undefined,
): number | undefined {
  const { data } = useQuery(convexQuery(api.items.listCities, {}));
  if (city === undefined) return undefined;
  return data?.find((c) => cityKey(c.city) === cityKey(city))?.placeCount;
}

/** How many places a trip can fill: the city page's place count when known, since one save can name many places. */
export function tripPlaceEstimate(
  saveCount: number,
  cities: { city: string; count: number }[],
  city: string | undefined,
  placeCount: number | undefined,
): number {
  return Math.max(placeCount ?? 0, tripSaveCount(saveCount, cities, city));
}

export function daysSavesFill(saveCount: number, pace: TripPace): number {
  return Math.max(1, Math.ceil(saveCount / STOPS_PER_DAY[pace]));
}

const TRIP_MIN_CITY_SAVES = 3;

export function canPlanTrip(
  items: { status: string; cities?: string[] }[],
): boolean {
  return (
    items.filter(
      (item) => item.status === "ready" && (item.cities ?? []).length > 0,
    ).length >= TRIP_MIN_CITY_SAVES
  );
}

export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function tripDayDate(
  startDate: string | undefined,
  offset: number,
): Date | null {
  if (startDate === undefined) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + offset);
}

export function formatTripDay(date: Date): string {
  return date.toLocaleDateString(formattingLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export type LatLng = { latitude: number; longitude: number };

export function locatedStops(
  stops: TripStopView[],
): { stop: TripStopView; index: number; coordinates: LatLng }[] {
  return stops.flatMap((stop, index) =>
    stop.lat !== undefined && stop.lng !== undefined
      ? [
          {
            stop,
            index,
            coordinates: { latitude: stop.lat, longitude: stop.lng },
          },
        ]
      : [],
  );
}

export const TRIP_PANEL_SHARE = 0.52;

/** `worldWidth` is the points 360° of longitude spans at zoom 0; `centerY` is where the camera's center lands. */
type MapView = {
  width: number;
  height: number;
  top: number;
  bottom: number;
  worldWidth: number;
  centerY: number;
};

const FIT_FILL = 0.8;
const MIN_SPAN = 0.004;

export function fitCamera(
  points: LatLng[],
  view: MapView,
): { coordinates: LatLng; zoom: number } | undefined {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  // In Mercator a degree of latitude is 1 / cos(latitude) times taller than a degree of longitude is wide.
  const cos = Math.cos((midLat * Math.PI) / 180);
  const visible = Math.max(view.height - view.top - view.bottom, 1);
  const byWidth = Math.log2(
    (360 * FIT_FILL * view.width) /
      (view.worldWidth * Math.max(maxLng - minLng, MIN_SPAN)),
  );
  const byHeight = Math.log2(
    (360 * FIT_FILL * visible * cos) /
      (view.worldWidth * Math.max(maxLat - minLat, MIN_SPAN)),
  );
  const zoom = Math.min(16, Math.max(3, Math.min(byWidth, byHeight)));
  const latPerPoint = (360 * cos) / (view.worldWidth * 2 ** zoom);
  const visibleMiddle = view.top + visible / 2;
  return {
    coordinates: {
      latitude: midLat - (view.centerY - visibleMiddle) * latPerPoint,
      longitude: (minLng + maxLng) / 2,
    },
    zoom,
  };
}

export type StopPick = { day: number; itemId: Id<"items">; name: string };

export function pickedStop(
  days: Pick<TripDayView, "stops">[] | undefined,
  pick: StopPick | null,
): { ref: { day: number; stop: number }; view: TripStopView } | null {
  if (pick === null) return null;
  const stops = days?.[pick.day]?.stops ?? [];
  const stop = stops.findIndex(
    (s) => s.itemId === pick.itemId && s.name === pick.name,
  );
  return stop === -1
    ? null
    : { ref: { day: pick.day, stop }, view: stops[stop] };
}

export function directionsUrl(
  stop: Pick<TripStopView, "name" | "area" | "lat" | "lng">,
  city: string | undefined,
): string {
  const label = [stop.name, stop.area, city].filter(Boolean).join(", ");
  const destination =
    stop.lat !== undefined && stop.lng !== undefined
      ? `${stop.lat},${stop.lng}`
      : label;
  if (Platform.OS === "ios") {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&q=${encodeURIComponent(stop.name)}&dirflg=w`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

export type TripRequest = {
  days: number;
  pace: TripPace;
  startDate?: string;
  city?: string;
};

type BuildState =
  | { status: "idle" }
  | { status: "building" }
  | { status: "arriving"; previous: Id<"trips"> | null }
  | { status: "empty"; considered: number }
  | { status: "error" };

/** `arriving` lasts until the subscription shows a trip other than `previous`; an empty result keeps the old trip. */
export function useBuildTrip(spaceId: Id<"spaces">, locale: string) {
  const makeTrip = useAction(api.trips.makeTrip);
  const [state, setState] = useState<BuildState>({ status: "idle" });

  const build = useCallback(
    async (
      request: TripRequest,
      previous: Id<"trips"> | null,
    ): Promise<boolean> => {
      setState({ status: "building" });
      try {
        const result = await makeTrip({ spaceId, locale, ...request });
        analytics.capture("trip_made", {
          considered: result.considered,
          days: request.days,
          pace: request.pace,
          made: result.tripId !== null,
        });
        if (result.tripId === null) {
          setState({ status: "empty", considered: result.considered });
          return false;
        }
        setState({ status: "arriving", previous });
        return true;
      } catch (error) {
        analytics.capture("trip_failed", { reason: "error" });
        analytics.captureError("make_trip_failed", error);
        setState({ status: "error" });
        return false;
      }
    },
    [makeTrip, spaceId, locale],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, build, reset };
}

import { analytics } from "@/lib/analytics";
import { formattingLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isAiConsentRequired } from "@convex/model/aiConsent";
import type { TripPace, TripSlot } from "@convex/model/trip";
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

/** Saves in a space that name a city before "Plan my trip" shows: enough to
 * read as a travel space, not a reading list that mentions one place. */
const TRIP_MIN_CITY_SAVES = 3;

/** Pin and chip color per day. Map pins sit on Apple's own map colors in
 * both appearances, so these are fixed rather than theme roles; day 1 is the
 * app's amber. */
const DAY_COLORS = ["#e6a23c", "#3fb0a1", "#d37ec7", "#6f9be8", "#86bf5a"];

export function dayColor(day: number): string {
  return DAY_COLORS[day % DAY_COLORS.length];
}

/** A travel space: at least three ready saves name a city. */
export function canPlanTrip(
  items: { status: string; cities?: string[] }[],
): boolean {
  return (
    items.filter(
      (item) => item.status === "ready" && (item.cities ?? []).length > 0,
    ).length >= TRIP_MIN_CITY_SAVES
  );
}

/** "YYYY-MM-DD" for a picked calendar day, in the user's own time zone. */
export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The calendar day `offset` days after a "YYYY-MM-DD" start, as a local
 * date, or null without a start. */
export function tripDayDate(
  startDate: string | undefined,
  offset: number,
): Date | null {
  if (startDate === undefined) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + offset);
}

/** "Fri, Nov 7" in the user's formatting locale. */
export function formatTripDay(date: Date): string {
  return date.toLocaleDateString(formattingLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export type LatLng = { latitude: number; longitude: number };

/** Stops Apple Maps placed, with their index in the day. */
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

/** Share of the screen the day list covers over the map. */
export const TRIP_PANEL_SHARE = 0.52;

/** The map's size and what covers it: the header above, the panel below. */
type MapView = {
  width: number;
  height: number;
  top: number;
  bottom: number;
};

// Room kept between the outer pins and the edges of the visible map.
const FIT_FILL = 0.8;
// Closest a day zooms in, so one stop still shows its streets.
const MIN_SPAN = 0.004;

/**
 * A camera that frames every point in the part of the map left visible
 * between the header and the panel, or undefined for none. The zoom follows
 * expo-maps on iOS: the map's width spans 360 / 2^zoom degrees of longitude.
 */
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
  // On the map a degree of latitude is 1 / cos(latitude) times taller than a
  // degree of longitude is wide.
  const cos = Math.cos((midLat * Math.PI) / 180);
  const visible = Math.max(view.height - view.top - view.bottom, 1);
  const byWidth = Math.log2(
    (360 * FIT_FILL) / Math.max(maxLng - minLng, MIN_SPAN),
  );
  const byHeight = Math.log2(
    (360 * FIT_FILL * visible * cos) /
      (view.width * Math.max(maxLat - minLat, MIN_SPAN)),
  );
  const zoom = Math.min(16, Math.max(3, Math.min(byWidth, byHeight)));
  const latPerPoint = (360 * cos) / (view.width * 2 ** zoom);
  return {
    // Moved so the points sit in the middle of the visible part, not of the
    // whole map.
    coordinates: {
      latitude: midLat - ((view.bottom - view.top) / 2) * latPerPoint,
      longitude: (minLng + maxLng) / 2,
    },
    zoom,
  };
}

/** A stop picked on one day, by its save and name. */
export type StopPick = { day: number; itemId: Id<"items">; name: string };

/** The picked stop and where it now sits in its day, or null once it is
 * gone. Found by save and name, so a swap that reorders the day keeps it. */
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

/** Walking directions to a stop in the platform's maps app. */
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
  // Made and stored; the screen keeps building until `getSpaceTrip` shows it.
  | { status: "arriving"; tripId: Id<"trips"> }
  | { status: "empty"; considered: number }
  | { status: "ai_off" }
  | { status: "error" };

/**
 * Runs `trips.makeTrip`. The stored trip arrives through `getSpaceTrip`'s
 * subscription, which can land after the action returns, so a success
 * leaves "arriving" with the new trip's id; "empty" means no save named a
 * place and the last trip, if any, stays.
 */
export function useBuildTrip(spaceId: Id<"spaces">, locale: string) {
  const makeTrip = useAction(api.trips.makeTrip);
  const [state, setState] = useState<BuildState>({ status: "idle" });

  const build = useCallback(
    async (request: TripRequest): Promise<boolean> => {
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
        setState({ status: "arriving", tripId: result.tripId });
        return true;
      } catch (error) {
        const aiOff = isAiConsentRequired(error);
        analytics.capture("trip_failed", {
          reason: aiOff ? "ai_consent" : "error",
        });
        if (!aiOff) analytics.captureError("make_trip_failed", error);
        setState({ status: aiOff ? "ai_off" : "error" });
        return false;
      }
    },
    [makeTrip, spaceId, locale],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, build, reset };
}

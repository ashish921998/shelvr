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

/** A camera that frames every point with a little room, or undefined for none. */
export function fitCamera(
  points: LatLng[],
): { coordinates: LatLng; zoom: number } | undefined {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.004);
  // One zoom step halves the span on screen; 360° fills zoom 0. The extra
  // room keeps the outer pins clear of the edges and the panel below.
  const zoom = Math.min(16, Math.max(3, Math.log2(360 / (span * 2.6))));
  return {
    // Shifted south of centre: the day panel covers the lower part of the map.
    coordinates: {
      latitude: (minLat + maxLat) / 2 - span * 0.35,
      longitude: (minLng + maxLng) / 2,
    },
    zoom,
  };
}

/** Walking directions to a stop in the platform's maps app. */
export function directionsUrl(
  stop: Pick<TripStopView, "name" | "area" | "lat" | "lng">,
  city: string | undefined,
): string {
  const label = [stop.name, stop.area, city].filter(Boolean).join(", ");
  const located = stop.lat !== undefined && stop.lng !== undefined;
  if (Platform.OS === "ios") {
    const destination = located ? `${stop.lat},${stop.lng}` : label;
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&q=${encodeURIComponent(stop.name)}&dirflg=w`;
  }
  const destination = located ? `${stop.lat},${stop.lng}` : label;
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
  | { status: "empty"; considered: number }
  | { status: "ai_off" }
  | { status: "error" };

/**
 * Runs `trips.makeTrip`. The stored trip arrives through `getSpaceTrip`'s
 * subscription, so a success here only clears the building state; "empty"
 * means no save named a place and the last trip, if any, stays.
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
        setState({ status: "idle" });
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

import { formattingLocale } from "@/lib/i18n";
import type { TripPace } from "@convex/model/trip";

export type { TripPace };
export { MAX_TRIP_DAYS, MIN_TRIP_DAYS } from "@convex/model/trip";

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

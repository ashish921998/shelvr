import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

export type SharedTrip = {
  name?: string;
  city: string;
  startDate?: string;
  days: { name: string; lat: number; lng: number }[][];
  unplanned: { name: string; lat: number; lng: number }[];
};

function isStop(value: unknown): value is SharedTrip["unplanned"][number] {
  if (typeof value !== "object" || value === null) return false;
  return (
    "name" in value &&
    typeof value.name === "string" &&
    "lat" in value &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    Math.abs(value.lat) <= 90 &&
    "lng" in value &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lng) <= 180
  );
}
function isStops(value: unknown): value is SharedTrip["unplanned"] {
  return Array.isArray(value) && value.length <= 150 && value.every(isStop);
}
function isTrip(value: unknown): value is SharedTrip {
  if (typeof value !== "object" || value === null) return false;
  return (
    "city" in value &&
    typeof value.city === "string" &&
    (!("name" in value) || typeof value.name === "string") &&
    (!("startDate" in value) || typeof value.startDate === "string") &&
    "days" in value &&
    Array.isArray(value.days) &&
    value.days.length <= 15 &&
    value.days.every(isStops) &&
    "unplanned" in value &&
    isStops(value.unplanned)
  );
}

export async function loadTripShare(
  token: string,
): Promise<
  | { outcome: "found"; trip: SharedTrip }
  | { outcome: "missing" | "unavailable" }
> {
  if (!/^[a-f0-9]{32}$/.test(token)) return { outcome: "missing" };
  const base = convexSiteUrl();
  if (!base) return { outcome: "unavailable" };
  try {
    const response = await fetch(`${base}/trip/shares/${token}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) throw new Error("Trip unavailable");
    const trip: unknown = await response.json();
    if (!isTrip(trip)) throw new Error("Invalid trip");
    return { outcome: "found", trip };
  } catch {
    serverLog("error", "trip_share_load_failed", {});
    return { outcome: "unavailable" };
  }
}

export function tripMapUrl(stop: SharedTrip["unplanned"][number]): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("q", stop.name);
  url.searchParams.set("ll", `${stop.lat},${stop.lng}`);
  return url.toString();
}

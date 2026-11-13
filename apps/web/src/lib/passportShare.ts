import { cache } from "react";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

const TIMEOUT_MS = 5_000;

type Dot = { lat: number; lng: number };

export type PassportCity = { city?: string; dot?: Dot; names: string[] };

export type SharedPassport = {
  ownerName?: string;
  places: number;
  cities: number;
  countries: number | null;
  byCity: PassportCity[];
};

type PassportResult =
  | { outcome: "found"; passport: SharedPassport }
  | { outcome: "missing" | "unavailable"; passport?: undefined };

function shareUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/passport/shares/${encodeURIComponent(token)}`;
}

async function fetchPassport(token: string): Promise<PassportResult> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return { outcome: "unavailable" };

  try {
    const response = await fetch(shareUrl(siteUrl, token), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) {
      serverLog("error", "passport_share_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    return {
      outcome: "found",
      passport: (await response.json()) as SharedPassport,
    };
  } catch (error) {
    serverLog("error", "passport_share_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export const loadPassport = cache(fetchPassport);

export async function recordPassportOpen(token: string): Promise<void> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return;
  try {
    const response = await fetch(shareUrl(siteUrl, token), {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) {
      serverLog("error", "passport_open_failed", { status: response.status });
    }
  } catch (error) {
    serverLog("error", "passport_open_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
  }
}

export function passportTitle(passport: SharedPassport | undefined): string {
  return passport?.ownerName
    ? `${passport.ownerName}’s passport`
    : "A Shelvr passport";
}

function plural(count: number, word: string, words: string): string {
  return `${count} ${count === 1 ? word : words}`;
}

export function passportSummary(passport: SharedPassport): string {
  return [
    plural(passport.places, "place", "places"),
    plural(passport.cities, "city", "cities"),
    ...(passport.countries === null
      ? []
      : [plural(passport.countries, "country", "countries")]),
  ].join(" · ");
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LABEL_GAP = 24;
const LABEL_CHAR_WIDTH = 7.5;
const LABEL_EDGE = 4;

export function dotMap(
  byCity: readonly PassportCity[],
  size: { width: number; height: number; pad: number; spread: number },
) {
  const cities = new Map<
    string,
    { names: string[]; dot: Dot; count: number }
  >();
  for (const { city, dot, names } of byCity) {
    if (!dot) continue;
    const key = `${dot.lat},${dot.lng}`;
    const found = cities.get(key) ?? { names: [], dot, count: 0 };
    found.count += names.length;
    const name = city?.trim() ?? "";
    const known = found.names.some(
      (other) => other.toLowerCase() === name.toLowerCase(),
    );
    if (name !== "" && !known) found.names.push(name);
    cities.set(key, found);
  }
  const groups = [...cities.values()];
  if (groups.length === 0) return [];
  const most = Math.sqrt(Math.max(...groups.map(({ count }) => count)));
  const step = Math.min(size.spread, (size.height - 2 * size.pad) / 4 / most);
  const inset = size.pad + step * most;
  const lats = groups.map(({ dot }) => dot.lat);
  const midLat =
    ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const project = ({ lat, lng }: Dot) => ({
    x: lng * Math.cos(midLat),
    y: -lat,
  });
  const points = groups.map(({ dot }) => project(dot));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const innerW = size.width - 2 * inset;
  const innerH = size.height - 2 * inset;
  const scale =
    spanX === 0 && spanY === 0
      ? 0
      : Math.min(
          spanX === 0 ? Infinity : innerW / spanX,
          spanY === 0 ? Infinity : innerH / spanY,
        );
  const offsetX = inset + (innerW - spanX * scale) / 2;
  const offsetY = inset + (innerH - spanY * scale) / 2;
  return groups.map((group, index) => {
    const x = offsetX + (points[index].x - Math.min(...xs)) * scale;
    const y = offsetY + (points[index].y - Math.min(...ys)) * scale;
    const joined = group.names.join(" · ");
    const fits = Math.floor((size.width - 2 * LABEL_EDGE) / LABEL_CHAR_WIDTH);
    const city =
      joined.length > fits ? `${joined.slice(0, fits - 1).trimEnd()}…` : joined;
    const half = (city.length * LABEL_CHAR_WIDTH) / 2;
    return {
      city,
      x,
      y,
      labelX: Math.max(
        Math.min(x, size.width - LABEL_EDGE - half),
        LABEL_EDGE + half,
      ),
      labelY: y + LABEL_GAP + step * Math.sqrt(group.count),
      dots: Array.from({ length: group.count }, (_, i) => ({
        x: x + step * Math.sqrt(i) * Math.cos(i * GOLDEN_ANGLE),
        y: y + step * Math.sqrt(i) * Math.sin(i * GOLDEN_ANGLE),
      })),
    };
  });
}

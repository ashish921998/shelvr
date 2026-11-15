import { api } from "@convex/_generated/api";
import { passportCounts } from "@convex/model/passport";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import qrcode from "qrcode-generator";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";
import type { CityStamp } from "@/lib/city-stamp-data";
import { type Stamp, stampDate } from "@/lib/passport";

export const STORY_PHOTOS = 4;
const STORY_CITIES = 2;

type StoryCity = { name: string; country: string | null };

export type PassportStory = {
  places: number;
  cities: number;
  countries: number | null;
  fromReels: boolean;
  cityStamps: StoryCity[];
  photos: Stamp[];
  more: number;
};

function newestFirst(stamps: readonly Stamp[]): Stamp[] {
  return [...stamps].sort((a, b) => (stampDate(b) ?? 0) - (stampDate(a) ?? 0));
}

function storyCities(
  stamps: readonly Stamp[],
  cityStamps: readonly CityStamp[],
  label: (city: string) => string,
): StoryCity[] {
  const picked: StoryCity[] = [...cityStamps]
    .sort((a, b) => b.stampedAt - a.stampedAt)
    .slice(0, STORY_CITIES)
    .map((stamp) => ({ name: label(stamp.city), country: stamp.country }));
  const seen = new Set(picked.map((city) => cityKey(city.name)));
  const counts = new Map<string, { name: string; count: number }>();
  for (const stamp of stamps) {
    if (!stamp.city) continue;
    const key = cityKey(stamp.city);
    if (seen.has(key)) continue;
    const entry = counts.get(key) ?? { name: stamp.city, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const busiest = [...counts.values()].sort((a, b) => b.count - a.count);
  for (const city of busiest) {
    if (picked.length >= STORY_CITIES) break;
    picked.push({ name: city.name, country: null });
  }
  return picked;
}

export function passportStoryOf(
  stamps: readonly Stamp[],
  cityStamps: readonly CityStamp[],
  label: (city: string) => string = (city) => city,
): PassportStory {
  const counts = passportCounts(stamps, cityStamps);
  const sorted = newestFirst(stamps);
  const photos = sorted
    .filter((stamp) => stamp.cover !== null)
    .slice(0, STORY_PHOTOS);
  return {
    places: counts.places,
    cities: counts.cities,
    countries: counts.countries,
    fromReels: stamps.some(
      (stamp) => stamp.source === "instagram" || stamp.source === "tiktok",
    ),
    cityStamps: storyCities(stamps, cityStamps, label),
    photos,
    more: Math.max(0, stamps.length - photos.length),
  };
}

export function qrModules(text: string): boolean[][] {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => code.isDark(row, col)),
  );
}

export function darkRuns(row: readonly boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  row.forEach((dark, index) => {
    if (dark && start === -1) start = index;
    if (!dark && start !== -1) {
      runs.push([start, index - start]);
      start = -1;
    }
  });
  if (start !== -1) runs.push([start, row.length - start]);
  return runs;
}

export function usePassportTogether(): number | undefined {
  const { isAuthenticated } = useConvexAuth();
  const together = useQuery(
    convexQuery(
      api.placeVisits.passportTogether,
      isAuthenticated ? {} : "skip",
    ),
  );
  useEffect(() => {
    if (together.error) {
      analytics.captureError("passport_together_load_failed", together.error);
    }
  }, [together.error]);
  return together.data;
}

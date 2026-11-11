import { cityPinId, type CityPin } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import { type VisitMark, visitMatcher } from "@convex/model/placeVisits";

export function visitedPinIds(
  pins: readonly CityPin[],
  visits: readonly VisitMark[],
): ReadonlySet<string> {
  const visited = visitMatcher(visits, pins);
  return new Set(pins.filter((pin) => visited(pin)).map(cityPinId));
}

export function cityProgress(
  pins: readonly CityPin[],
  visited: ReadonlySet<string>,
): { visited: number; total: number } {
  return {
    visited: pins.filter((pin) => visited.has(cityPinId(pin))).length,
    total: pins.length,
  };
}

export function progressLine(progress: {
  visited: number;
  total: number;
}): string | null {
  if (progress.visited === 0 || progress.total === 0) return null;
  return t("cityProgress.visited", {
    count: progress.total,
    visited: String(Math.min(progress.visited, progress.total)),
  });
}

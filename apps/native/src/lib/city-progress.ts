import { t } from "@/lib/i18n";
import { placeKey } from "@convex/model/plan";

export function isVisited(name: string, visited: ReadonlySet<string>): boolean {
  return visited.has(placeKey(name));
}

export function cityProgress(
  pins: readonly { name: string }[],
  visited: ReadonlySet<string>,
): { visited: number; total: number } {
  return {
    visited: pins.filter((pin) => isVisited(pin.name, visited)).length,
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

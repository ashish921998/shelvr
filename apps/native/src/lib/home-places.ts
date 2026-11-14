import { progressLine } from "@/lib/city-progress";
import { t } from "@/lib/i18n";
import { isTerminalFailure } from "@convex/model/itemFields";
import { displayHost } from "@/lib/url";
import { cityKey } from "@convex/model/trip";

export type City = {
  city: string;
  count: number;
  placeCount?: number;
  visitedCount?: number;
  cover: string | null;
};

type PlaceableSave = {
  _id: string;
  status: "processing" | "ready" | "failed";
  cities?: string[];
};

/** Saves that no city card shows: still reading, failed, or no place found. */
export function unplacedSaves<T extends PlaceableSave>(saves: T[]): T[] {
  return saves.filter(
    (save) => save.status !== "ready" || (save.cities ?? []).length === 0,
  );
}

type ReviewableSave = PlaceableSave & {
  failureReason?: Parameters<typeof isTerminalFailure>[0];
  enrichment?: string;
};

/** Finished saves Home has no city for: the read failed, or it named no place. */
export function savesToReview<T extends PlaceableSave>(saves: T[]): T[] {
  return saves.filter(
    (save) =>
      save.status === "failed" ||
      (save.status === "ready" && (save.cities ?? []).length === 0),
  );
}

/** Saves that were reading on the last render and have now finished without a city. */
export function newlyUnplaced<T extends PlaceableSave>(
  before: ReadonlyMap<string, PlaceableSave["status"]>,
  saves: T[],
): T[] {
  return savesToReview(saves).filter(
    (save) => before.get(save._id) === "processing",
  );
}

/** Mirrors the server's reprocessItem check, so Retry shows only where it can run. */
export function canRetrySave(save: ReviewableSave): boolean {
  if (save.status === "failed") {
    return !isTerminalFailure(save.failureReason);
  }
  return save.status === "ready" && save.enrichment === "partial";
}

/** The site a save came from, never its raw URL. */
export function saveSource(save: { siteName?: string; url?: string }): string {
  return save.siteName?.trim() || displayHost(save.url);
}

export function plannableCities(cities: City[]): City[] {
  return cities.filter((entry) => entry.placeCount !== 0);
}

export function cityCountLine(entry: City): string | null {
  if (entry.placeCount === 0) {
    return t("homePlaces.noPlaceYet", { count: entry.count });
  }
  if (!entry.placeCount) return null;
  return (
    progressLine({
      visited: entry.visitedCount ?? 0,
      total: entry.placeCount,
    }) ?? t("homePlaces.spotCount", { count: entry.placeCount })
  );
}

export function sharedListCover(
  listCities: readonly string[] | undefined,
  mine: readonly City[] | undefined,
): string | null {
  for (const name of listCities ?? []) {
    const cover = mine?.find(
      (entry) => cityKey(entry.city) === cityKey(name),
    )?.cover;
    if (cover) return cover;
  }
  return null;
}

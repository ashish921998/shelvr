import { isTerminalFailure } from "@convex/model/itemFields";
import { displayHost } from "@/lib/url";

const VISIBLE_CITIES = 4;

export type City = {
  city: string;
  count: number;
  placeCount?: number;
  cover: string | null;
};

/** The cities to draw now, and how many the "+ n more" tile stands for. */
export function visibleCities(
  cities: City[],
  expanded: boolean,
): { shown: City[]; hidden: number } {
  if (expanded || cities.length <= VISIBLE_CITIES) {
    return { shown: cities, hidden: 0 };
  }
  return {
    shown: cities.slice(0, VISIBLE_CITIES),
    hidden: cities.length - VISIBLE_CITIES,
  };
}

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

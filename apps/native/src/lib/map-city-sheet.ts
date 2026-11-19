import { t } from "@/lib/i18n";
import { saveCover, type StampSave } from "@/lib/map-stamps";

const RECENT_LIMIT = 12;

export function recentSaves<T extends StampSave>(saves: readonly T[]): T[] {
  return saves
    .filter((save) => saveCover(save) !== undefined)
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, RECENT_LIMIT);
}

export function citySummary(saves: number, places: number): string {
  return t("mapSheet.summary", {
    saves: t("trip.revealSaves", { count: saves }),
    places: t("homePlaces.spotCount", { count: places }),
  });
}

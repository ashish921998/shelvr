import { saveSource } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import { saveCover, type StampSave } from "@/lib/map-stamps";
import { linkSource } from "@convex/model/externalUrl";

export type SheetSave = StampSave & { author?: string; siteName?: string };

const RECENT_LIMIT = 12;

export function recentSaves<T extends SheetSave>(saves: readonly T[]): T[] {
  return saves
    .filter((save) => saveCover(save) !== undefined)
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, RECENT_LIMIT);
}

function creditFor(save: SheetSave): string | undefined {
  if (save.author && linkSource(save.url) !== undefined)
    return save.author.startsWith("@") ? save.author : `@${save.author}`;
  return save.author ?? saveSource(save);
}

export function saveCardDetail(save: SheetSave): string {
  const count = save.placePins?.length ?? 0;
  const author = creditFor(save);
  if (count === 0) return author ?? "";
  const places = t("homePlaces.spotCount", { count });
  return author ? t("mapSheet.cardDetail", { places, author }) : places;
}

export function citySummary(saves: number, places: number): string {
  return t("mapSheet.summary", {
    saves: t("trip.revealSaves", { count: saves }),
    places: t("homePlaces.spotCount", { count: places }),
  });
}

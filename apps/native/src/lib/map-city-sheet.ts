import { t } from "@/lib/i18n";

export type SheetSave = {
  _id: string;
  _creationTime: number;
  title?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
};

const RECENT_LIMIT = 12;

export function saveCover(save: SheetSave): string | undefined {
  return save.imageUrl ?? save.heroImageUrl;
}

export function recentSaves<T extends SheetSave>(saves: readonly T[]): T[] {
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

import { placeKinds } from "@convex/model/placeKinds";
import { canRetrySave } from "@/lib/home-places";
import { formattingLocale, t } from "@/lib/i18n";
import { KIND_LABELS } from "@/lib/map-filters";

export type SaveDay<T> = { key: string; title: string; saves: T[] };

function startOfDay(time: number): number {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function dayTitles(now: number): (start: number) => string {
  const today = startOfDay(now);
  const yesterday = startOfDay(today - 1);
  const year = new Date(now).getFullYear();
  const date = { weekday: "short", month: "short", day: "numeric" } as const;
  const thisYear = new Intl.DateTimeFormat(formattingLocale(), date);
  const otherYear = new Intl.DateTimeFormat(formattingLocale(), {
    ...date,
    year: "numeric",
  });
  return (start) => {
    if (start === today) return t("homePlaces.today");
    if (start === yesterday) return t("homePlaces.yesterday");
    const day = new Date(start);
    return (day.getFullYear() === year ? thisYear : otherYear).format(day);
  };
}

export function saveDays<T extends { _creationTime: number }>(
  saves: readonly T[],
  now = Date.now(),
): SaveDay<T>[] {
  const title = dayTitles(now);
  const days: SaveDay<T>[] = [];
  for (const save of saves) {
    const start = startOfDay(save._creationTime);
    const key = String(start);
    const last = days[days.length - 1];
    if (last?.key === key) last.saves.push(save);
    else days.push({ key, title: title(start), saves: [save] });
  }
  return days;
}

export function saveDetail(
  save: Parameters<typeof canRetrySave>[0] & { tags: readonly string[] },
): string {
  if (save.status === "processing") return t("homePlaces.noPlaceReading");
  const city = save.status === "ready" ? save.cities?.[0] : undefined;
  if (!city) {
    return save.status === "failed" || canRetrySave(save)
      ? t("homePlaces.reviewFailed")
      : t("homePlaces.noPlaceNone");
  }
  const [kind] = placeKinds(undefined, save.tags);
  return kind ? `${t(KIND_LABELS[kind])} · ${city}` : city;
}

export function countLabel(count: number, more: boolean): string {
  const shown = new Intl.NumberFormat(formattingLocale()).format(count);
  return more ? t("homePlaces.countAtLeast", { n: shown }) : shown;
}

import { GOAL_SPACES } from "@/lib/onboarding-goals";
import { tripDayDate } from "@/lib/trip";
import type { Id } from "@convex/_generated/dataModel";

export type HomeMode = "dates" | "trips";

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The spaces onboarding names for the date and travel goals; the first in list order wins. */
export function goalSpaceIds(spaces: { _id: Id<"spaces">; name: string }[]): {
  date?: Id<"spaces">;
  travel?: Id<"spaces">;
} {
  const find = (names: readonly string[]) =>
    spaces.find((space) => names.some((name) => sameName(space.name, name)))
      ?._id;
  return { date: find(GOAL_SPACES.date), travel: find(GOAL_SPACES.travel) };
}

const WEEK_DAYS = 7;
const FRIDAY_INDEX = 4;

/** Monday-first initials of the week holding the next Friday (today when it is Friday), that Friday highlighted. */
export function weekStrip(
  now: Date,
  locale: string,
): { label: string; highlighted: boolean }[] {
  const daysToFriday = (5 - now.getDay() + 7) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysToFriday - FRIDAY_INDEX,
  );
  const initial = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  return Array.from({ length: WEEK_DAYS }, (_, index) => ({
    label: initial.format(
      new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + index,
      ),
    ),
    highlighted: index === FRIDAY_INDEX,
  }));
}

/** Cities by save count, each with how far it is from the saves a trip needs. */
export function cityProgress(
  cities: { city: string; count: number }[],
  min: number,
): {
  city: string;
  count: number;
  ready: boolean;
  remaining: number;
  fraction: number;
}[] {
  return [...cities]
    .sort((a, b) => b.count - a.count)
    .map(({ city, count }) => ({
      city,
      count,
      ready: count >= min,
      remaining: Math.max(0, min - count),
      fraction: Math.min(1, count / min),
    }));
}

/** Whole calendar days from `now` to the trip start; null when unset, malformed or already past. */
export function daysUntil(
  startDate: string | undefined,
  now: Date,
): number | null {
  const start = tripDayDate(startDate, 0);
  if (start === null) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

export function greetingKey(
  hour: number,
):
  | "homePlans.greetingMorning"
  | "homePlans.greetingAfternoon"
  | "homePlans.greetingEvening" {
  if (hour < 12) return "homePlans.greetingMorning";
  if (hour < 18) return "homePlans.greetingAfternoon";
  return "homePlans.greetingEvening";
}

type Spot = { status: string; _creationTime: number };

/** Up to `limit` saves, ready ones first, newest first within each group. */
export function spotRows<T extends Spot>(items: T[], limit: number): T[] {
  const rank = (item: Spot) => (item.status === "ready" ? 0 : 1);
  return [...items]
    .sort((a, b) => rank(a) - rank(b) || b._creationTime - a._creationTime)
    .slice(0, limit);
}

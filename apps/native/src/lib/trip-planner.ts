import { formattingLocale, t } from "@/lib/i18n";
import { formatTripDay, toDateKey, tripDayDate } from "@/lib/trip";
import type { TextMessageKey } from "@/locales/message-types";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { saveErrorCode } from "@convex/model/saveErrors";
import {
  cityKey,
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  STOPS_PER_DAY,
  tidyCity,
  type TripPace,
} from "@convex/model/trip";
import {
  TRIP_INTERESTS,
  type TripInterest,
  type TripPlanStop,
  type TripPlanSummary,
} from "@convex/model/tripPlan";
import { ConvexError } from "convex/values";
import { Platform } from "react-native";

export const TRIP_PACES: TripPace[] = ["easy", "balanced", "packed"];

/** A first trip leans on what most city saves are: places to eat, drink coffee and look at. */
export const DEFAULT_INTERESTS: TripInterest[] = ["food", "coffee", "sights"];

const DEFAULT_TRIP_DAYS = 3;

// Kept short so a typed city or hotel stays one line and one Apple Maps query.
export const MAX_CITY_LENGTH = 80;
export const MAX_STAY_LENGTH = 120;

const INTEREST_LABELS: Record<TripInterest, TextMessageKey> = {
  food: "tripPlanner.interestFood",
  coffee: "tripPlanner.interestCoffee",
  drinks: "tripPlanner.interestDrinks",
  culture: "tripPlanner.interestCulture",
  sights: "tripPlanner.interestSights",
  outdoors: "tripPlanner.interestOutdoors",
  shopping: "tripPlanner.interestShopping",
};

const PACE_LABELS: Record<TripPace, TextMessageKey> = {
  easy: "trip.paceEasy",
  balanced: "trip.paceBalanced",
  packed: "trip.pacePacked",
};

export function interestLabel(interest: TripInterest): string {
  return t(INTEREST_LABELS[interest]);
}

export function paceLabel(pace: TripPace): string {
  return t(PACE_LABELS[pace]);
}

export function paceHint(pace: TripPace): string {
  return t("tripPlanner.paceStops", { count: STOPS_PER_DAY[pace] });
}

/** Turns an interest on or off, in the fixed order the chips show; the last one stays on. */
export function toggleInterest(
  selected: readonly TripInterest[],
  interest: TripInterest,
): TripInterest[] {
  const on = selected.includes(interest);
  if (on && selected.length === 1) return [...selected];
  return TRIP_INTERESTS.filter((each) =>
    each === interest ? !on : selected.includes(each),
  );
}

export function clampDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_TRIP_DAYS;
  return Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, Math.round(days)));
}

export type CityChoice = { city: string; count: number };

/** The cities with saves, the most saved first; the city page's city leads when it has none yet. */
export function cityChoices(
  cities: readonly { city: string; count: number }[],
): CityChoice[] {
  return cities
    .filter((entry) => entry.count > 0 && tidyCity(entry.city) !== "")
    .map((entry) => ({ city: entry.city, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

export function sameCity(a: string, b: string): boolean {
  return cityKey(a) === cityKey(b);
}

export type TripForm = {
  city: string;
  days: number;
  startDate: Date | null;
  pace: TripPace;
  interests: TripInterest[];
  stay: string;
};

export function initialTripForm(city?: string): TripForm {
  return {
    city: city === undefined ? "" : tidyCity(city).slice(0, MAX_CITY_LENGTH),
    days: DEFAULT_TRIP_DAYS,
    startDate: null,
    pace: "balanced",
    interests: [...DEFAULT_INTERESTS],
    stay: "",
  };
}

type TripPlanArgs = {
  city: string;
  days: number;
  startDate?: string;
  pace: TripPace;
  interests: TripInterest[];
  stay?: string;
  locale?: string;
};

export type TripFormProblem = "city" | "interests";

/** What stops the form from planning yet, or null once it can; the submit button stays off until then. */
export function tripFormProblem(
  form: Pick<TripForm, "city" | "interests">,
): TripFormProblem | null {
  if (tidyCity(form.city) === "") return "city";
  if (!TRIP_INTERESTS.some((each) => form.interests.includes(each))) {
    return "interests";
  }
  return null;
}

export function tripFormArgs(
  form: TripForm,
  locale: string,
): { ok: true; args: TripPlanArgs } | { ok: false; problem: TripFormProblem } {
  const problem = tripFormProblem(form);
  if (problem !== null) return { ok: false, problem };
  const city = tidyCity(form.city).slice(0, MAX_CITY_LENGTH);
  const interests = TRIP_INTERESTS.filter((each) =>
    form.interests.includes(each),
  );
  const stay = tidyCity(form.stay).slice(0, MAX_STAY_LENGTH);
  return {
    ok: true,
    args: {
      city,
      days: clampDays(form.days),
      pace: form.pace,
      interests,
      locale,
      ...(form.startDate ? { startDate: toDateKey(form.startDate) } : {}),
      ...(stay ? { stay } : {}),
    },
  };
}

export type TripPlanFailure = "rate_limited" | "pro_required" | "error";

function errorCode(error: unknown): unknown {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null
    ? (data as { code?: unknown }).code
    : undefined;
}

export function tripPlanFailure(error: unknown): TripPlanFailure {
  if (isRateLimitedError(error) || errorCode(error) === "rate_limited") {
    return "rate_limited";
  }
  if (saveErrorCode(error) === "pro_required") return "pro_required";
  return "error";
}

export function tripTitle(city: string): string {
  return t("tripPlanner.tripTitle", { city });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** "4 Nov – 6 Nov" for a dated trip, or null when it has no start date. */
export function tripDateRange(
  startDate: string | undefined,
  dayCount: number,
): string | null {
  const start = tripDayDate(startDate, 0);
  if (start === null) return null;
  if (dayCount <= 1) return shortDate(start);
  const end = tripDayDate(startDate, dayCount - 1);
  if (end === null) return shortDate(start);
  return t("tripPlanner.dateRange", {
    start: shortDate(start),
    end: shortDate(end),
  });
}

/** The length line under a trip's title: "3 days · 4 Nov – 6 Nov". */
export function tripLengthLine(
  trip: Pick<TripPlanSummary, "dayCount" | "startDate">,
): string {
  const days = t("trip.dayCount", { count: trip.dayCount });
  const dates = tripDateRange(trip.startDate, trip.dayCount);
  return dates === null
    ? days
    : t("tripPlanner.lengthWithDates", { days, dates });
}

/**
 * The length line on a trip's card. Without dates it says when the trip was planned, so two
 * trips to one city still read apart: "3 days · Planned Oct 27".
 */
export function tripCardLine(
  trip: Pick<TripPlanSummary, "dayCount" | "startDate" | "createdAt">,
): string {
  if (tripDateRange(trip.startDate, trip.dayCount) !== null) {
    return tripLengthLine(trip);
  }
  return t("tripPlanner.lengthPlanned", {
    days: t("trip.dayCount", { count: trip.dayCount }),
    date: shortDate(new Date(trip.createdAt)),
  });
}

/** "8 stops · 5 from your saves" */
export function tripStopsLine(
  trip: Pick<TripPlanSummary, "stopCount" | "savedCount">,
): string {
  const stops = t("trip.stopCount", { count: trip.stopCount });
  if (trip.savedCount === 0) return stops;
  return t("tripPlanner.stopsFromSaves", {
    count: trip.savedCount,
    stops,
  });
}

/** "Day 2 · Wed, Nov 5", or "Day 2" when the trip has no start date. */
export function tripDayLabel(
  dayIndex: number,
  startDate: string | undefined,
): string {
  const day = String(dayIndex + 1);
  const date = tripDayDate(startDate, dayIndex);
  return date === null
    ? t("trip.dayTab", { day })
    : t("tripPlanner.dayWithDate", { day, date: formatTripDay(date) });
}

export function newestFirst<T extends { createdAt: number }>(
  trips: readonly T[],
): T[] {
  return [...trips].sort((a, b) => b.createdAt - a.createdAt);
}

export function stopBadge(
  source: TripPlanStop["source"],
): TextMessageKey | null {
  switch (source) {
    case "save":
      return "tripPlanner.badgeYours";
    case "suggested":
      return "tripPlanner.badgeSuggested";
    case "added":
      return null;
  }
}

/** What tapping a stop does: open its save, Apple's place card, or the place in Maps. */
export type StopAction =
  | { kind: "save"; itemId: NonNullable<TripPlanStop["itemId"]> }
  | { kind: "card"; appleId: string }
  | { kind: "maps"; url: string };

export function stopAction(
  stop: Pick<
    TripPlanStop,
    "source" | "itemId" | "appleId" | "name" | "lat" | "lng"
  >,
  cardAvailable: boolean,
): StopAction {
  if (stop.source === "save" && stop.itemId !== undefined) {
    return { kind: "save", itemId: stop.itemId };
  }
  if (stop.appleId !== undefined && cardAvailable) {
    return { kind: "card", appleId: stop.appleId };
  }
  if (stop.itemId !== undefined) return { kind: "save", itemId: stop.itemId };
  return { kind: "maps", url: placeMapsUrl(stop) };
}

function placeMapsUrl(
  stop: Pick<TripPlanStop, "name" | "lat" | "lng">,
): string {
  const at = `${stop.lat},${stop.lng}`;
  if (Platform.OS === "ios") {
    return `https://maps.apple.com/?ll=${at}&q=${encodeURIComponent(stop.name)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(at)}`;
}

export const REVEAL_STEPS: TextMessageKey[] = [
  "tripPlanner.revealRead",
  "tripPlanner.revealFind",
  "tripPlanner.revealBuild",
];

// Each line holds long enough to read while the planner works; once the trip is
// ready the remaining lines tick through quickly so the reveal never stalls it.
const REVEAL_STEP_MS = 1600;
const REVEAL_FAST_MS = 280;

/**
 * How long the reveal stays on `step` before moving on, or null while it waits
 * for the trip. Step `REVEAL_STEPS.length` is "all done", held briefly before leaving.
 */
export function revealDelay(step: number, ready: boolean): number | null {
  if (ready) return REVEAL_FAST_MS;
  return step < REVEAL_STEPS.length - 1 ? REVEAL_STEP_MS : null;
}

/**
 * A trip day's colour: its slot in the theme's `tripDays` palette, cycling once a trip
 * runs past the palette's length, so the map, the chips and the list agree on it.
 */
export function dayColor(
  day: number,
  palette: readonly [string, ...string[]],
): string {
  const slot = Number.isInteger(day) ? day : 0;
  const n = palette.length;
  return palette[((slot % n) + n) % n] ?? palette[0];
}

type PlanPin = {
  id: string;
  day: number;
  number: number;
  name: string;
  coordinates: { latitude: number; longitude: number };
  active: boolean;
  /** What the pin shows: its day's number when every day is showing, its stop number in a focused day, nothing when faded. */
  text: string;
  /** The label under the pin; faded pins carry none so the focused day reads cleanly. */
  title: string;
  /** What VoiceOver and TalkBack say for the pin, faded or not: "Day 2, stop 3, Prado". */
  label: string;
};

/**
 * One pin per stop, numbered within its day; `activeDay` null means every day is in focus.
 * With every day showing, each pin carries its day's number, so day 1's first stop and
 * day 2's first stop never both read "1".
 */
export function planPins(
  days: readonly Pick<TripPlanStop, "name" | "lat" | "lng">[][],
  activeDay: number | null,
): PlanPin[] {
  return days.flatMap((stops, day) =>
    stops.map((stop, index) => {
      const active = activeDay === null || activeDay === day;
      return {
        id: `${day}:${index}`,
        day,
        number: index + 1,
        name: stop.name,
        coordinates: { latitude: stop.lat, longitude: stop.lng },
        active,
        text:
          activeDay === null
            ? String(day + 1)
            : active
              ? String(index + 1)
              : "",
        title: active ? stop.name : "",
        label: t("tripPlanner.pinLabel", {
          day: String(day + 1),
          stop: String(index + 1),
          name: stop.name,
        }),
      };
    }),
  );
}

/** The day a trip opens on: its first day with a stop, or every day when none has one. */
export function firstFocusDay(
  days: readonly (readonly unknown[])[],
): number | null {
  const day = days.findIndex((stops) => stops.length > 0);
  return day === -1 ? null : day;
}

/** Where to scroll so a day's header sits just under the map pinned over the list. */
export function dayScrollOffset(
  headerY: number,
  mapHeight: number,
  gap: number,
): number {
  return Math.max(0, headerY - mapHeight - gap);
}

/**
 * The day whose section sits under the pinned map once the list has scrolled to `scrollY`:
 * the last day whose header has reached `probe` points below the top, the first day before
 * any has. At the very end of the list the last day wins, since its header may never reach
 * the probe. `dayTops` holds each day's header offset in the scroll content, or undefined
 * before that day has laid out.
 */
export function dayAtScroll(
  scrollY: number,
  probe: number,
  dayTops: readonly (number | undefined)[],
  atEnd: boolean,
): number | null {
  const laidOut = dayTops.flatMap((top, day) =>
    top === undefined ? [] : [{ top, day }],
  );
  if (laidOut.length === 0) return null;
  if (atEnd) return laidOut[laidOut.length - 1]?.day ?? null;
  const reached = laidOut.filter(({ top }) => top <= scrollY + probe);
  return (reached[reached.length - 1] ?? laidOut[0])?.day ?? null;
}

/** True when the list is scrolled to (or within a point of) its end. */
export function scrolledToEnd(
  scrollY: number,
  viewportHeight: number,
  contentHeight: number,
): boolean {
  return (
    contentHeight > viewportHeight &&
    scrollY + viewportHeight >= contentHeight - 1
  );
}

/**
 * The stops whose `why` is the title of a save several of the trip's stops come from,
 * so the row can say where they came from. A save naming one place sends its own
 * description instead, which reads on its own.
 */
export function sharedSaveStops(
  stops: readonly Pick<TripPlanStop, "_id" | "itemId" | "why">[],
): Set<string> {
  const counts = new Map<string, number>();
  const key = (stop: Pick<TripPlanStop, "itemId" | "why">) =>
    stop.itemId === undefined || !stop.why
      ? null
      : `${stop.itemId}:${stop.why}`;
  for (const stop of stops) {
    const k = key(stop);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return new Set(
    stops
      .filter((stop) => {
        const k = key(stop);
        return k !== null && (counts.get(k) ?? 0) > 1;
      })
      .map((stop) => stop._id),
  );
}

/** The trip page's back button title: the trips list it was opened from, or a plain "Back". */
export function tripBackTitle(previousRoute: string | undefined): string {
  return previousRoute === "(tabs)"
    ? t("tripPlanner.listTitle")
    : t("common.back");
}

export function pinDay(id: string | undefined): number | null {
  const day = Number((id ?? "").split(":")[0]);
  return id !== undefined && id.includes(":") && Number.isInteger(day)
    ? day
    : null;
}

/** Why the form is showing a message instead of planning; kept as data so the copy follows a language change. */
export type TripPlanProblem =
  | { kind: TripFormProblem }
  | { kind: "empty"; city: string }
  | { kind: Exclude<TripPlanFailure, "pro_required"> };

export function tripPlanMessage(problem: TripPlanProblem): string {
  switch (problem.kind) {
    case "city":
      return t("tripPlanner.cityRequired");
    case "interests":
      return t("tripPlanner.interestsHint");
    case "empty":
      return t("tripPlanner.emptyResult", { city: problem.city });
    case "rate_limited":
      return t("tripPlanner.rateLimited");
    case "error":
      return t("tripPlanner.failed");
  }
}

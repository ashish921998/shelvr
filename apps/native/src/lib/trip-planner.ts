import { formattingLocale, t } from "@/lib/i18n";
import { formatTripDay, toDateKey, tripDayDate } from "@/lib/trip";
import type { TextMessageKey } from "@/locales/message-types";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { saveErrorCode } from "@convex/model/saveErrors";
import { countryName } from "@convex/model/tripCountries";
import {
  cityKey,
  distanceKm,
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  STOPS_PER_DAY,
  tidyCity,
  type LatLng,
  type TripPace,
} from "@convex/model/trip";
import {
  TRIP_INTERESTS,
  type TripInterest,
  type TripPlanStop,
  type TripPlanSummary,
} from "@convex/model/tripPlan";
import { Platform } from "react-native";

export const TRIP_PACES: TripPace[] = ["easy", "balanced", "packed"];

/** A first trip leans on what most city saves are: places to eat, drink coffee and look at. */
export const DEFAULT_INTERESTS: TripInterest[] = ["food", "coffee", "sights"];

const DEFAULT_TRIP_DAYS = 3;

export function countryFlag(code: string) {
  return String.fromCodePoint(
    ...Array.from(code, (letter) => letter.charCodeAt(0) + 127397),
  );
}

export function tripCountryLine(countries: string[]) {
  return countries.map((code) => countryName(code) ?? code).join(" · ");
}

export function tripCoverUri(cover: string) {
  return `data:image/jpeg;base64,${cover}`;
}

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

export type TripCityCompletion = FunctionReturnType<
  typeof api.tripPlanner.searchTripCities
>[number];

export function tripCitySuggestions(
  cities: CityChoice[],
  completions: TripCityCompletion[],
  pins: readonly (LatLng & { city?: string })[],
  query: string,
) {
  if (!query) return [];
  const wanted = cityKey(query);
  const suggestions = new Map<
    string,
    { city: string; label: string; count?: number; location?: LatLng }
  >();
  for (const saved of cities) {
    const key = cityKey(saved.city);
    if (key.includes(wanted))
      suggestions.set(key, { ...saved, label: saved.city });
  }
  for (const { label, locality, location } of completions) {
    const saved = cities.find(
      ({ city }) =>
        sameCity(city, label) ||
        (sameCity(city, locality) &&
          location !== undefined &&
          pins.some(
            (pin) =>
              pin.city !== undefined &&
              sameCity(pin.city, city) &&
              distanceKm(pin, location) <= 30,
          )),
    );
    const city = saved?.city ?? label;
    const key = cityKey(city);
    if (
      !suggestions.has(key) ||
      (saved && suggestions.get(key)?.label === city)
    )
      suggestions.set(key, {
        city,
        label,
        count: saved?.count,
        ...(location ? { location } : {}),
      });
  }
  return [...suggestions.values()].slice(0, 5);
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

export type TripFormProblem = "city";

/** What stops the form from planning yet, or null once it can; the submit button stays off until then. */
export function tripFormProblem(
  form: Pick<TripForm, "city">,
): TripFormProblem | null {
  return tidyCity(form.city) === "" ? "city" : null;
}

export function tripFormArgs(
  form: TripForm,
  locale: string,
): { ok: true; args: TripPlanArgs } | { ok: false; problem: TripFormProblem } {
  // The server tidies the city and stay; the stepper and the chips keep days and interests valid.
  const problem = tripFormProblem(form);
  if (problem !== null) return { ok: false, problem };
  return {
    ok: true,
    args: {
      city: form.city,
      days: form.days,
      pace: form.pace,
      interests: form.interests,
      locale,
      ...(form.startDate ? { startDate: toDateKey(form.startDate) } : {}),
      ...(form.stay.trim() ? { stay: form.stay } : {}),
    },
  };
}

export type TripPlanFailure = "rate_limited" | "pro_required" | "error";

export function tripPlanFailure(error: unknown): TripPlanFailure {
  if (isRateLimitedError(error)) return "rate_limited";
  if (saveErrorCode(error) === "pro_required") return "pro_required";
  return "error";
}

export function tripTitle(city: string): string {
  return t("tripPlanner.tripTitle", { city });
}

/** The name the person gave the trip, else "<city> trip". */
export function tripName(trip: { name?: string; city: string }): string {
  return trip.name?.trim() || tripTitle(trip.city);
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
  // A start that parsed always has an end.
  const end = tripDayDate(startDate, dayCount - 1) ?? start;
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

export function tripCardDate(
  trip: Pick<TripPlanSummary, "dayCount" | "startDate" | "createdAt">,
): string {
  return (
    tripDateRange(trip.startDate, trip.dayCount) ??
    t("tripPlanner.plannedDate", { date: shortDate(new Date(trip.createdAt)) })
  );
}

export function tripCardLine(
  trip: Pick<TripPlanSummary, "dayCount" | "startDate" | "createdAt">,
): string {
  return t("tripPlanner.lengthWithDates", {
    days: t("trip.dayCount", { count: trip.dayCount }),
    dates: tripCardDate(trip),
  });
}

/**
 * The interests a trip was planned for, as the card shows them: "Food, Coffee, Sights &
 * landmarks", or null when it has none. Trips to one city read apart by what they were for.
 */
export function tripInterestsLine(
  trip: Pick<TripPlanSummary, "interests">,
): string | null {
  if (trip.interests.length === 0) return null;
  return trip.interests.map(interestLabel).join(", ");
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

export function stopBadge(
  stop: Pick<TripPlanStop, "source" | "itemId">,
): TextMessageKey {
  switch (stop.source) {
    case "save":
      return "tripPlanner.badgeYours";
    case "list":
      return stop.itemId === undefined
        ? "tripPlanner.badgeOnList"
        : "tripPlanner.badgeYours";
    case "suggested":
      return "tripPlanner.badgeSuggested";
    case "added":
      return "tripPlanner.badgeAdded";
  }
}

/**
 * The explanation line under a stop: "From “Best of Lisbon”" when its `why` is the title of a
 * save several stops share, the `why` itself otherwise, or null when it has none.
 */
export function stopWhyLine(
  stop: Pick<TripPlanStop, "why">,
  fromSave: boolean,
): string | null {
  if (!stop.why) return null;
  return fromSave ? t("tripPlanner.fromSave", { title: stop.why }) : stop.why;
}

/**
 * What VoiceOver and TalkBack say for a stop row, in the order it reads on screen:
 * "Stop 3, Kafeine, Yours, Alfama, From “Best of Lisbon”". Unplanned stops have no number.
 */
export function stopRowLabel(
  stop: Pick<
    TripPlanStop,
    "name" | "source" | "itemId" | "area" | "why" | "time" | "note"
  >,
  { number, fromSave }: { number?: number; fromSave: boolean },
): string {
  return [
    number === undefined
      ? null
      : t("tripPlanner.stopNumber", { number: String(number) }),
    stop.name,
    stop.time,
    t(stopBadge(stop)),
    stop.area,
    stopWhyLine(stop, fromSave),
    stop.note,
  ]
    .filter(Boolean)
    .join(", ");
}

/** What tapping a stop does: open its save, Apple's place card, or the place in Maps. */
export type StopAction =
  | { kind: "save"; itemId: NonNullable<TripPlanStop["itemId"]> }
  | { kind: "card"; appleId: string }
  | { kind: "maps"; url: string };

export function stopAction(
  stop: Pick<TripPlanStop, "itemId" | "appleId" | "name" | "lat" | "lng">,
  cardAvailable: boolean,
): StopAction {
  if (stop.itemId !== undefined) {
    return { kind: "save", itemId: stop.itemId };
  }
  if (stop.appleId !== undefined && cardAvailable) {
    return { kind: "card", appleId: stop.appleId };
  }
  return { kind: "maps", url: placeMapsUrl(stop) };
}

export function placeMapsUrl(
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
  return palette[day % palette.length] ?? palette[0];
}

type PlanPin = {
  id: string;
  day: number;
  name: string;
  coordinates: { latitude: number; longitude: number };
  active: boolean;
  /** What the pin shows: its day's number when every day is showing, its stop number in a focused day, nothing when faded. */
  text: string;
  /**
   * The caption MapKit prints under the pin, which VoiceOver also reads: the place's name on
   * a focused day's pins, and empty (no caption) on faded pins and across "All days", so
   * the map stays legible. The stop rows carry each place's day and stop for VoiceOver.
   */
  title: string;
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
      const focused = activeDay === day;
      return {
        id: `${day}:${index}`,
        day,
        name: stop.name,
        coordinates: { latitude: stop.lat, longitude: stop.lng },
        active: activeDay === null || focused,
        text:
          activeDay === null
            ? String(day + 1)
            : focused
              ? String(index + 1)
              : "",
        title: focused ? stop.name : "",
      };
    }),
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

/** Why the form is showing a message instead of planning; kept as data so the copy follows a language change. */
export type TripPlanProblem =
  | { kind: TripFormProblem }
  | { kind: "empty"; city: string }
  | { kind: Exclude<TripPlanFailure, "pro_required"> };

export function tripPlanMessage(problem: TripPlanProblem): string {
  switch (problem.kind) {
    case "city":
      return t("tripPlanner.cityRequired");
    case "empty":
      return t("tripPlanner.emptyResult", { city: problem.city });
    case "rate_limited":
      return t("tripPlanner.rateLimited");
    case "error":
      return t("tripPlanner.failed");
  }
}

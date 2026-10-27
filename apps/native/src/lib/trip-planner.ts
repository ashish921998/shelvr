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

export function stopBadge(source: TripPlanStop["source"]): TextMessageKey {
  switch (source) {
    case "save":
      return "tripPlanner.badgeYours";
    case "suggested":
      return "tripPlanner.badgeSuggested";
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
  stop: Pick<TripPlanStop, "name" | "source" | "area" | "why">,
  { number, fromSave }: { number?: number; fromSave: boolean },
): string {
  return [
    number === undefined
      ? null
      : t("tripPlanner.stopNumber", { number: String(number) }),
    stop.name,
    t(stopBadge(stop.source)),
    stop.area,
    stopWhyLine(stop, fromSave),
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
 * The trip page's focused day and whether the list is moving under the person's finger.
 * `day` null is "All days". `scroll` is `dragging` from the moment a finger moves the list,
 * `released` once it lifts, `momentum` while a flick decelerates, and `idle` otherwise,
 * including while a picked day's scroll animates and while layout or VoiceOver moves the list.
 */
export type DayFocus = {
  day: number | null;
  scroll: "idle" | "dragging" | "released" | "momentum";
};

/**
 * What can move the trip page's focus. `pick` is a chip, a day header, a pin or a stop;
 * the scroll events carry the day `dayAtScroll` reports for the list's position then, or
 * null when no day has laid out.
 */
export type DayFocusEvent =
  | { type: "pick"; day: number | null }
  | { type: "dragStart" }
  | { type: "dragEnd"; day: number | null }
  | { type: "momentumStart" }
  | { type: "momentumEnd"; day: number | null }
  | { type: "scroll"; day: number | null };

export function initialDayFocus(
  days: readonly (readonly unknown[])[],
): DayFocus {
  return { day: firstFocusDay(days), scroll: "idle" };
}

function follow(focus: DayFocus, day: number | null): number | null {
  // "All days" holds until the person picks a day; the list's position never replaces it.
  if (focus.day === null || day === null) return focus.day;
  return day;
}

function withFocus(
  focus: DayFocus,
  day: number | null,
  scroll: DayFocus["scroll"],
): DayFocus {
  return focus.day === day && focus.scroll === scroll ? focus : { day, scroll };
}

/**
 * The focus after `event`. Only the person's own scrolling (a drag and the flick after it)
 * moves the focused day, and never away from "All days"; a pick always wins, and ends any
 * scroll still settling, so what the person tapped is what stays focused. Scroll events
 * outside a drag (a picked day's animation, layout, VoiceOver bringing an element into view)
 * change nothing. Returns `focus` itself when nothing changes, so React skips the render.
 */
export function nextDayFocus(focus: DayFocus, event: DayFocusEvent): DayFocus {
  switch (event.type) {
    case "pick":
      return withFocus(focus, event.day, "idle");
    case "dragStart":
      return withFocus(focus, focus.day, "dragging");
    case "dragEnd":
      return focus.scroll === "dragging"
        ? withFocus(focus, follow(focus, event.day), "released")
        : focus;
    case "momentumStart":
      return focus.scroll === "released"
        ? withFocus(focus, focus.day, "momentum")
        : focus;
    case "momentumEnd":
      return focus.scroll === "momentum"
        ? withFocus(focus, follow(focus, event.day), "idle")
        : withFocus(focus, focus.day, "idle");
    case "scroll":
      return focus.scroll === "dragging" || focus.scroll === "momentum"
        ? withFocus(focus, follow(focus, event.day), focus.scroll)
        : focus;
  }
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

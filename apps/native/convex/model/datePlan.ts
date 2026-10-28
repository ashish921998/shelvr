import { type Infer, v } from "convex/values";
import { distanceKm } from "./trip";
import { samePlace } from "./tripSuggest";

// "Plan a date": an evening of two stops near each other in one city. The app imports this
// module for the result's types and the swap rule, so it stays free of server-only imports.

/** The kinds of date the app offers; "surprise" lets the planner pick one the saves can make. */
export const dateKindValidator = v.union(
  v.literal("classic"),
  v.literal("lowkey"),
);
export type DateKind = Infer<typeof dateKindValidator>;

export const dateAskValidator = v.union(
  dateKindValidator,
  v.literal("surprise"),
);
export type DateAsk = Infer<typeof dateAskValidator>;

export const DATE_KINDS: readonly DateKind[] = ["classic", "lowkey"];

/** First the dinner or the coffee, then the drinks, the dessert or the walk. */
export const dateSlotValidator = v.union(
  v.literal("first"),
  v.literal("second"),
);
export type DateSlot = Infer<typeof dateSlotValidator>;

/** Two stops of one evening are never farther apart than a short walk, as the crow flies. */
export const MAX_WALK_KM = 1.5;

export const dateStopValidator = v.object({
  slot: dateSlotValidator,
  source: v.union(v.literal("save"), v.literal("suggested")),
  itemId: v.optional(v.id("items")),
  name: v.string(),
  area: v.optional(v.string()),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  why: v.optional(v.string()),
});
export type DateStop = Infer<typeof dateStopValidator>;

/** One evening: indexes into the plan's stops. */
export const dateEveningValidator = v.object({
  first: v.number(),
  second: v.number(),
});
export type DateEvening = Infer<typeof dateEveningValidator>;

export const datePlanResultValidator = v.object({
  /**
   * `no_anchor`: no saved, pinned place in the city fits this kind of date.
   * `no_pair`: saved places fit, but none has a second stop within a walk.
   */
  status: v.union(
    v.literal("ready"),
    v.literal("no_anchor"),
    v.literal("no_pair"),
  ),
  city: v.string(),
  kind: dateKindValidator,
  /** Each slot's stops, best first. */
  stops: v.array(dateStopValidator),
  /** Evenings best first. Current builds show the first and change stops with `swapStop`. */
  evenings: v.array(dateEveningValidator),
});
export type DatePlanResult = Infer<typeof datePlanResultValidator>;

/** One venue for a date: Apple's ids decide when both stops have one, else `samePlace`. */
function sameVenue(a: DateStop, b: DateStop): boolean {
  if (a.appleId !== undefined && b.appleId !== undefined) {
    return a.appleId === b.appleId;
  }
  return samePlace(a, b);
}

/** Whether two stops make an evening: two venues a walk apart, at least one the person's own. */
export function pairs(a: DateStop, b: DateStop): boolean {
  return (
    a.slot !== b.slot &&
    (a.source === "save" || b.source === "save") &&
    distanceKm(a, b) <= MAX_WALK_KM &&
    !sameVenue(a, b)
  );
}

/**
 * The stop that takes `slot`'s place in the evening: the nearest one to the stop kept that
 * still pairs with it and is not in `tried` (the stops already shown against it). Once every
 * one has been tried it starts over from the nearest. Null when no other stop pairs.
 */
export function swapStop(
  stops: readonly DateStop[],
  evening: DateEvening,
  slot: DateSlot,
  tried: readonly number[] = [],
): DateEvening | null {
  const current = evening[slot];
  const kept = stops[slot === "first" ? evening.second : evening.first];
  if (kept === undefined) return null;
  const line = stops
    .map((stop, index) => ({ stop, index, km: distanceKm(stop, kept) }))
    .filter(
      ({ stop, index }) =>
        index !== current && stop.slot === slot && pairs(stop, kept),
    )
    .sort((a, b) => a.km - b.km || a.index - b.index);
  const next = line.find(({ index }) => !tried.includes(index)) ?? line[0];
  return next === undefined ? null : { ...evening, [slot]: next.index };
}

import { type Infer, v } from "convex/values";
import { distanceKm } from "./trip";

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

/** Whether two stops make an evening: a walk apart, and at least one of them the person's own. */
export function pairs(a: DateStop, b: DateStop): boolean {
  return (
    a.slot !== b.slot &&
    (a.source === "save" || b.source === "save") &&
    distanceKm(a, b) <= MAX_WALK_KM
  );
}

/**
 * The stop that takes `slot`'s place in the evening: the next one in that slot's list after
 * the current one that still pairs with the stop kept, wrapping round. Null when none does.
 */
export function swapStop(
  stops: readonly DateStop[],
  evening: DateEvening,
  slot: DateSlot,
): DateEvening | null {
  const current = evening[slot];
  const kept = stops[slot === "first" ? evening.second : evening.first];
  if (kept === undefined) return null;
  for (let step = 1; step < stops.length; step++) {
    const index = (current + step) % stops.length;
    const stop = stops[index];
    if (stop.slot === slot && pairs(stop, kept)) {
      return { ...evening, [slot]: index };
    }
  }
  return null;
}

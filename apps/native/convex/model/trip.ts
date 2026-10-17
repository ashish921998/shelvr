import { type Infer, v } from "convex/values";
import { distanceKm, MAX_CITY_DISTANCE_KM, type LatLng } from "./appleMaps";
import type { PlanPlace } from "./plan";

// Trip mode: a travel space's saves laid out as a day-by-day trip. The model
// picks the places the saves name and a time of day for each; Apple Maps
// says where they are; this module (pure, tested without either) groups them
// into one area per day and orders each day.

export const MIN_TRIP_DAYS = 1;
export const MAX_TRIP_DAYS = 5;

export const tripPaceValidator = v.union(
  v.literal("easy"),
  v.literal("balanced"),
  v.literal("packed"),
);
export type TripPace = Infer<typeof tripPaceValidator>;

/** Stops a day holds at each pace. */
export const STOPS_PER_DAY: Record<TripPace, number> = {
  easy: 3,
  balanced: 5,
  packed: 7,
};

/** Places the model may return: a packed five-day trip. */
export const MAX_TRIP_PLACES = STOPS_PER_DAY.packed * MAX_TRIP_DAYS;

export const TRIP_SLOTS = [
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "evening",
] as const;
export type TripSlot = (typeof TRIP_SLOTS)[number];

export const tripSlotValidator = v.union(
  v.literal("morning"),
  v.literal("lunch"),
  v.literal("afternoon"),
  v.literal("dinner"),
  v.literal("evening"),
);

export const tripStopValidator = v.object({
  itemId: v.id("items"),
  name: v.string(),
  area: v.optional(v.string()),
  why: v.string(),
  slot: tripSlotValidator,
  // Where Apple Maps puts the place. Absent when the lookup found nothing,
  // or the map was off; the stop still shows in the day's list.
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  address: v.optional(v.string()),
  // The user marked this place "We went".
  been: v.optional(v.boolean()),
});
export type TripStop = Infer<typeof tripStopValidator>;

export const tripDayValidator = v.object({
  // Up to two neighbourhoods the day's stops are in, as the saves write them.
  areas: v.array(v.string()),
  stops: v.array(tripStopValidator),
  // Meals the day has no saved place for, shown as gaps, never filled with a
  // place the saves don't name.
  gaps: v.array(tripSlotValidator),
});
export type TripDay = Infer<typeof tripDayValidator>;

/** A place the model picked, grounded in its save, with where it is. */
export type TripCandidate = PlanPlace & {
  slot: TripSlot | "any";
  location?: LatLng;
  address?: string;
};

const SLOT_RANK: Record<TripSlot, number> = {
  morning: 0,
  lunch: 1,
  afternoon: 2,
  dinner: 3,
  evening: 4,
};

/** "any" (a sight, a shop) fills the afternoon. */
function slotOf(candidate: TripCandidate): TripSlot {
  return candidate.slot === "any" ? "afternoon" : candidate.slot;
}

function toStop(candidate: TripCandidate): TripStop {
  return {
    itemId: candidate.itemId,
    name: candidate.name,
    ...(candidate.area !== undefined ? { area: candidate.area } : {}),
    why: candidate.why,
    slot: slotOf(candidate),
    ...(candidate.location !== undefined
      ? { lat: candidate.location.lat, lng: candidate.location.lng }
      : {}),
    ...(candidate.address !== undefined ? { address: candidate.address } : {}),
    ...(candidate.been ? { been: true } : {}),
  };
}

function centroid(points: LatLng[]): LatLng {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/** Seeds: the best-ranked place, then each next seed the place farthest from
 * every seed so far. Deterministic, so the same saves give the same trip. */
function seeds(points: LatLng[], k: number): LatLng[] {
  const chosen = [points[0]];
  while (chosen.length < k) {
    let best = points[0];
    let bestDistance = -1;
    for (const point of points) {
      const nearest = Math.min(...chosen.map((c) => distanceKm(c, point)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = point;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

/**
 * Groups located places into `k` days of at most `capacity` stops: k-means
 * whose assignment step hands out the closest (place, day) pairs first and
 * skips a full day, so no day overflows and each stays in one area.
 * Returns a day index per point.
 */
export function clusterPlaces(
  points: LatLng[],
  k: number,
  capacity: number,
): number[] {
  if (points.length === 0 || k === 0) return [];
  let centres = seeds(points, Math.min(k, points.length));
  let assignment: number[] = [];
  for (let round = 0; round < 10; round++) {
    const pairs: { point: number; day: number; d: number }[] = [];
    points.forEach((point, i) =>
      centres.forEach((centre, day) =>
        pairs.push({ point: i, day, d: distanceKm(point, centre) }),
      ),
    );
    pairs.sort((a, b) => a.d - b.d || a.point - b.point || a.day - b.day);
    const next: number[] = new Array<number>(points.length).fill(-1);
    const load: number[] = new Array<number>(centres.length).fill(0);
    for (const { point, day } of pairs) {
      if (next[point] !== -1 || load[day] >= capacity) continue;
      next[point] = day;
      load[day]++;
    }
    const stable = next.every((day, i) => day === assignment[i]);
    assignment = next;
    if (stable) break;
    centres = centres.map((centre, day) => {
      const members = points.filter((_, i) => assignment[i] === day);
      return members.length > 0 ? centroid(members) : centre;
    });
  }
  return assignment;
}

/** The key two places share when the saves put them in the same area. */
function areaKey(area: string | undefined): string {
  return (area ?? "").split(",")[0].trim().toLowerCase();
}

/** Up to two areas, most stops first, as the saves write them. */
function dayAreas(stops: TripCandidate[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const stop of stops) {
    const key = areaKey(stop.area);
    if (key === "") continue;
    const label = (stop.area ?? "").split(",")[0].trim();
    const entry = counts.get(key) ?? { label, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((entry) => entry.label);
}

/** Time of day first; inside one slot, the walk goes to the nearest next
 * stop. Unlocated stops keep the model's order. */
function orderDay(stops: TripCandidate[]): TripCandidate[] {
  const bySlot = [...stops].sort(
    (a, b) => SLOT_RANK[slotOf(a)] - SLOT_RANK[slotOf(b)],
  );
  const ordered: TripCandidate[] = [];
  for (const slot of TRIP_SLOTS) {
    const group = bySlot.filter((stop) => slotOf(stop) === slot);
    while (group.length > 0) {
      const from = ordered[ordered.length - 1]?.location;
      let pick = 0;
      if (from !== undefined) {
        let best = Infinity;
        group.forEach((stop, i) => {
          if (stop.location === undefined) return;
          const d = distanceKm(from, stop.location);
          if (d < best) {
            best = d;
            pick = i;
          }
        });
      }
      ordered.push(group.splice(pick, 1)[0]);
    }
  }
  return ordered;
}

const MEALS: TripSlot[] = ["lunch", "dinner"];

/**
 * Lays out ranked places (best first) as `days` days at `pace`. Places past
 * the trip's room, and any no day can take, go to `wishlist` in rank order.
 * Day 1 is the day holding the best place; empty days come last.
 */
export function buildTrip(
  candidates: TripCandidate[],
  options: { days: number; pace: TripPace },
): { days: TripDay[]; wishlist: TripStop[] } {
  const perDay = STOPS_PER_DAY[options.pace];
  const room = perDay * options.days;
  const chosen = candidates.slice(0, room);
  const wishlist: TripCandidate[] = candidates.slice(room);

  const located = chosen.filter((c) => c.location !== undefined);
  const groups: TripCandidate[][] = Array.from(
    { length: options.days },
    () => [],
  );
  const assignment = clusterPlaces(
    located.map((c) => c.location as LatLng),
    options.days,
    perDay,
  );
  located.forEach((candidate, i) => groups[assignment[i]].push(candidate));

  // Unlocated places join a day already in their area, else the emptiest day
  // with room.
  for (const candidate of chosen.filter((c) => c.location === undefined)) {
    const key = areaKey(candidate.area);
    const open = groups.filter((group) => group.length < perDay);
    const target =
      (key !== "" &&
        open.find((group) => group.some((s) => areaKey(s.area) === key))) ||
      [...open].sort((a, b) => a.length - b.length)[0];
    if (target === undefined) {
      wishlist.push(candidate);
    } else {
      target.push(candidate);
    }
  }

  const rank = new Map(candidates.map((c, i) => [c, i]));
  const firstRank = (group: TripCandidate[]) =>
    group.length === 0
      ? Infinity
      : Math.min(...group.map((c) => rank.get(c) ?? Infinity));
  const days = [...groups]
    .sort((a, b) => firstRank(a) - firstRank(b))
    .map((group): TripDay => {
      const stops = orderDay(group);
      const slots = new Set(stops.map(slotOf));
      return {
        areas: dayAreas(stops),
        stops: stops.map(toStop),
        gaps:
          stops.length === 0 ? [] : MEALS.filter((meal) => !slots.has(meal)),
      };
    });
  return {
    days,
    wishlist: wishlist
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
      .map(toStop),
  };
}

/**
 * Drops lookups that landed far from the rest: a place with the same name in
 * another city. Measured from `centre` (the trip's city) when known, else
 * from the median of the places found.
 */
export function keepNearby(
  found: (LatLng | null)[],
  centre: LatLng | null,
): (LatLng | null)[] {
  const points = found.filter((p): p is LatLng => p !== null);
  if (points.length === 0) return found;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const anchor = centre ?? {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  };
  return found.map((p) =>
    p !== null && distanceKm(p, anchor) <= MAX_CITY_DISTANCE_KM ? p : null,
  );
}

/** A start date the client sent, kept only as a real "YYYY-MM-DD" day. */
export function validStartDate(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/** The days a client asked for, held to 1..5. */
export function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 3;
  return Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, Math.round(days)));
}

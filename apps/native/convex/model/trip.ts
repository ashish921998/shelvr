import { type Infer, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { placeKey, type PlanPlace } from "./plan";

// Geometry lives here, not beside the Apple Maps client, because the app
// imports this module: anything it imports ships in the app bundle.
const MAX_CITY_DISTANCE_KM = 80;

export type LatLng = { lat: number; lng: number };

// Two lookups of one venue can land a few doors apart.
export const SAME_PLACE_KM = 0.3;

/** Count and draw the same mapped place once even when several saves mention it. */
export function uniquePlacePins<
  T extends LatLng & { name: string; appleId?: string },
>(pins: T[], merge?: (kept: T, repeat: T) => T): T[] {
  // Index into `kept` of the pin each Apple id was merged into.
  const byApple = new Map<string, number>();
  // Indexes into `kept` of each name's pins, to merge a nearby repeat into.
  const byName = new Map<string, number[]>();
  const kept: T[] = [];
  const absorb = (index: number, pin: T) => {
    if (merge) kept[index] = merge(kept[index], pin);
  };
  for (const pin of pins) {
    const sameVenue =
      pin.appleId === undefined ? undefined : byApple.get(pin.appleId);
    const key = placeKey(pin.name);
    const named = byName.get(key) ?? [];
    if (sameVenue !== undefined) {
      // Another name for a kept venue: a later pin under it without an Apple id joins it too.
      if (!named.includes(sameVenue)) byName.set(key, [...named, sameVenue]);
      absorb(sameVenue, pin);
      continue;
    }
    const same = named.find(
      (index) =>
        !otherVenue(kept[index], pin) &&
        distanceKm(kept[index], pin) <= SAME_PLACE_KM,
    );
    if (same !== undefined) {
      if (pin.appleId !== undefined) {
        // A later pin under another name may carry this id for the same venue,
        // and the kept pin needs it to open Apple's place card.
        byApple.set(pin.appleId, same);
        if (kept[same].appleId === undefined) {
          kept[same] = { ...kept[same], appleId: pin.appleId };
        }
      }
      absorb(same, pin);
      continue;
    }
    if (pin.appleId !== undefined) byApple.set(pin.appleId, kept.length);
    byName.set(key, [...named, kept.length]);
    kept.push(pin);
  }
  return kept;
}

/** Apple tells two nearby branches of one name apart; trust it over distance. */
function otherVenue(a: { appleId?: string }, b: { appleId?: string }): boolean {
  return (
    a.appleId !== undefined &&
    b.appleId !== undefined &&
    a.appleId !== b.appleId
  );
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const MIN_TRIP_DAYS = 1;
export const MAX_TRIP_DAYS = 15;

export const tripPaceValidator = v.union(
  v.literal("easy"),
  v.literal("balanced"),
  v.literal("packed"),
);
export type TripPace = Infer<typeof tripPaceValidator>;

export const STOPS_PER_DAY: Record<TripPace, number> = {
  easy: 3,
  balanced: 5,
  packed: 7,
};

export function tripPlaceCap(days: number): number {
  return STOPS_PER_DAY.packed * Math.max(days, 5);
}

export const MAX_CITY_CHARS = 80;

export function tidyCity(city: string): string {
  return city.replace(/\s+/g, " ").trim();
}

export function cityKey(city: string): string {
  return tidyCity(city).toLowerCase();
}

/** A pin belongs to its resolved city; legacy unlabelled pins are safe only for single-city saves. */
export function pinsForCity<T extends LatLng & { name: string; city?: string }>(
  item: { cities?: string[]; placePins?: T[] },
  city: string,
): T[] {
  const cities = new Set((item.cities ?? []).map(cityKey));
  return (item.placePins ?? []).filter((pin) =>
    pin.city
      ? cityKey(pin.city) === cityKey(city)
      : cities.size === 1 && cities.has(cityKey(city)),
  );
}

export function countCities(
  items: { cities?: string[] }[],
): { city: string; count: number }[] {
  const counts = new Map<
    string,
    { count: number; spellings: Map<string, number> }
  >();
  for (const item of items) {
    const seen = new Set<string>();
    for (const city of item.cities ?? []) {
      const key = cityKey(city);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { count: 0, spellings: new Map() };
      const spelling = tidyCity(city);
      entry.count++;
      entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .map(({ count, spellings }) => ({
      city: [...spellings].sort((a, b) => b[1] - a[1])[0][0],
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

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
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});
export type TripStop = Infer<typeof tripStopValidator>;

export const tripDayValidator = v.object({
  areas: v.array(v.string()),
  stops: v.array(tripStopValidator),
  gaps: v.array(tripSlotValidator),
});
export type TripDay = Infer<typeof tripDayValidator>;

export type TripCandidate = PlanPlace & {
  slot: TripSlot | "any";
  location?: LatLng;
};

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
  };
}

function centroid(points: LatLng[]): LatLng {
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

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

function areaKey(area: string | undefined): string {
  return (area ?? "").split(",")[0].trim().toLowerCase();
}

function dayAreas(stops: { area?: string }[]): string[] {
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

function orderDay(stops: TripCandidate[]): TripCandidate[] {
  const ordered: TripCandidate[] = [];
  for (const slot of TRIP_SLOTS) {
    const group = stops.filter((stop) => slotOf(stop) === slot);
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

function dayGaps(slots: Set<TripSlot>, stopCount: number): TripSlot[] {
  return stopCount === 0 ? [] : MEALS.filter((meal) => !slots.has(meal));
}

export function dayOf<Stop extends Pick<TripStop, "area" | "slot">>(
  stops: Stop[],
): { areas: string[]; stops: Stop[]; gaps: TripSlot[] } {
  return {
    areas: dayAreas(stops),
    stops,
    gaps: dayGaps(new Set(stops.map((s) => s.slot)), stops.length),
  };
}

/** Lays out ranked places (best first) as `days` days at `pace`; places past the room, or that no day can take, go to `wishlist` in rank order. */
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
    .map((group): TripDay => dayOf(orderDay(group).map(toStop)));
  return {
    days,
    wishlist: wishlist
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
      .map(toStop),
  };
}

/** The median point: one stray place cannot drag it away from the rest. */
export function middleOf(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  };
}

export function keepNearby(
  found: (LatLng | null)[],
  centre: LatLng | null,
): (LatLng | null)[] {
  const anchor =
    centre ?? middleOf(found.filter((p): p is LatLng => p !== null));
  if (anchor === null) return found;
  return found.map((p) =>
    p !== null && distanceKm(p, anchor) <= MAX_CITY_DISTANCE_KM ? p : null,
  );
}

/** Drops points far from the rest, but only when three or more agree on where "the rest" is. */
export function dropStrays<T extends LatLng>(
  points: (T | null)[],
): (T | null)[] {
  const before = points.filter((p) => p !== null).length;
  if (before < 3) return points;
  const kept = keepNearby(points, null);
  const after = kept.filter((p) => p !== null).length;
  return after * 2 > before
    ? points.map((p, i) => (kept[i] ? p : null))
    : points;
}

/** The Apple Maps query for a saved place: its name and area, plus the city when the area does not name it. */
export function lookupQuery(
  place: { name: string; area?: string },
  city: string | undefined,
): string {
  const area = place.area?.trim() ?? "";
  const parts = [place.name.trim(), area];
  if (city && !area.toLowerCase().includes(city.trim().toLowerCase())) {
    parts.push(city.trim());
  }
  return parts.filter(Boolean).join(", ");
}

export type SavedPin = { itemId: Id<"items">; name: string } & LatLng;

/** The map pin the save already has for this place, so a trip never looks it up again. */
export function savedPinFor(
  candidate: TripCandidate,
  pins: SavedPin[],
): LatLng | null {
  const key = placeKey(candidate.name);
  const pin = pins.find(
    (p) => p.itemId === candidate.itemId && placeKey(p.name) === key,
  );
  return pin ? { lat: pin.lat, lng: pin.lng } : null;
}

export function swapStop(
  trip: { days: TripDay[]; wishlist: TripStop[] },
  dayIndex: number,
  stopIndex: number,
): { days: TripDay[]; wishlist: TripStop[]; replacement: TripStop } | null {
  const day = trip.days[dayIndex];
  const stop = day?.stops[stopIndex];
  if (stop === undefined || trip.wishlist.length === 0) return null;
  const at = (s: TripStop): LatLng | null =>
    s.lat !== undefined && s.lng !== undefined
      ? { lat: s.lat, lng: s.lng }
      : null;
  const from = at(stop);
  const score = (s: TripStop, rank: number) => {
    const point = at(s);
    const distance =
      from !== null && point !== null ? distanceKm(from, point) : 1_000;
    return [s.slot === stop.slot ? 0 : 1, distance, rank];
  };
  const ranked = trip.wishlist
    .map((s, rank) => ({ rank, key: score(s, rank) }))
    .sort(
      (a, b) =>
        a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2],
    );
  const best = ranked[0].rank;
  const replacement = trip.wishlist[best];
  const stops = day.stops
    .map((s, i) => (i === stopIndex ? replacement : s))
    .sort((a, b) => TRIP_SLOTS.indexOf(a.slot) - TRIP_SLOTS.indexOf(b.slot));
  const days = trip.days.map((d, i) => (i === dayIndex ? dayOf(stops) : d));
  return {
    days,
    wishlist: [...trip.wishlist.filter((_, i) => i !== best), stop],
    replacement,
  };
}

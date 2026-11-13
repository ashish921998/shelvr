import { type Infer, v } from "convex/values";
import type { Placed } from "./placeIdentity";
import { barePlaceKey, type VisitMark, visitMatcher } from "./placeVisits";
import { placeKey } from "./plan";
import {
  cityKey,
  type LatLng,
  pinsForCity,
  tidyCity,
  uniquePlacePins,
} from "./trip";

export const cityCompletionValidator = v.object({
  city: v.string(),
  stamped: v.number(),
  total: v.number(),
});

export type CityCompletion = Infer<typeof cityCompletionValidator>;

type SavePin = LatLng & { name: string; city?: string; appleId?: string };

export type CompletionSave = {
  cities?: string[];
  placePins?: SavePin[];
};

export type CompletionStamp = {
  key: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  appleId?: string;
  visitedAt: number;
  backfilled?: boolean;
};

type CityTally = {
  spellings: Map<string, number>;
  savePins: SavePin[];
  pins: SavePin[];
  savesRead: number;
  strays: Placed[];
  lastStamp: number | null;
};

type CityPin = SavePin & { tally: CityTally };

type Row = CityCompletion & { lastStamp: number | null };

function tallyFor(
  tallies: Map<string, CityTally>,
  city: string,
): CityTally | undefined {
  const key = cityKey(city);
  if (key === "") return undefined;
  let tally = tallies.get(key);
  if (tally === undefined) {
    tally = {
      spellings: new Map(),
      savePins: [],
      pins: [],
      savesRead: 0,
      strays: [],
      lastStamp: null,
    };
    tallies.set(key, tally);
  }
  const spelling = tidyCity(city);
  tally.spellings.set(spelling, (tally.spellings.get(spelling) ?? 0) + 1);
  return tally;
}

function addSaves(
  tallies: Map<string, CityTally>,
  saves: readonly CompletionSave[],
  savesPerCity: number,
): void {
  for (const save of saves) {
    const seen = new Set<string>();
    for (const city of save.cities ?? []) {
      const key = cityKey(city);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const tally = tallyFor(tallies, city);
      if (tally === undefined || tally.savesRead >= savesPerCity) continue;
      tally.savesRead += 1;
      tally.savePins.push(...pinsForCity(save, city));
    }
  }
}

function addTo(index: Map<string, CityPin[]>, key: string, pin: CityPin) {
  if (key === "") return;
  const group = index.get(key);
  if (group === undefined) index.set(key, [pin]);
  else if (!group.includes(pin)) group.push(pin);
}

function pinIndex(tallies: Iterable<CityTally>): Map<string, CityPin[]> {
  const index = new Map<string, CityPin[]>();
  for (const tally of tallies) {
    tally.pins = uniquePlacePins(tally.savePins);
    for (const pin of tally.pins) {
      const entry = { ...pin, tally };
      addTo(index, `name:${placeKey(pin.name)}`, entry);
      addTo(index, `name:${barePlaceKey(pin.name)}`, entry);
      if (pin.appleId !== undefined) {
        addTo(index, `apple:${pin.appleId}`, entry);
      }
    }
  }
  return index;
}

function stampMark(stamp: CompletionStamp): VisitMark {
  if (stamp.lat === undefined || stamp.lng === undefined) {
    return { key: stamp.key, name: stamp.name };
  }
  const spot =
    stamp.appleId === undefined
      ? { lat: stamp.lat, lng: stamp.lng }
      : { lat: stamp.lat, lng: stamp.lng, appleId: stamp.appleId };
  return { key: stamp.key, name: stamp.name, spots: [spot] };
}

function tickedCities(
  stamp: CompletionStamp,
  index: ReadonlyMap<string, CityPin[]>,
): Set<CityTally> {
  const keys = [`name:${stamp.key}`, `name:${barePlaceKey(stamp.name)}`];
  if (stamp.appleId !== undefined) keys.push(`apple:${stamp.appleId}`);
  const candidates = [...new Set(keys.flatMap((key) => index.get(key) ?? []))];
  const ticks = visitMatcher([stampMark(stamp)], candidates);
  return new Set(candidates.filter(ticks).map((pin) => pin.tally));
}

function noteDate(tally: CityTally, stamp: CompletionStamp): void {
  if (stamp.backfilled) return;
  tally.lastStamp = Math.max(tally.lastStamp ?? -Infinity, stamp.visitedAt);
}

function addStamps(
  tallies: Map<string, CityTally>,
  stamps: readonly CompletionStamp[],
): void {
  const index = pinIndex(tallies.values());
  for (const stamp of stamps) {
    const ticked = tickedCities(stamp, index);
    for (const tally of ticked) noteDate(tally, stamp);
    if (ticked.size > 0 || stamp.lat === undefined || stamp.lng === undefined) {
      continue;
    }
    const tally = stamp.city ? tallyFor(tallies, stamp.city) : undefined;
    if (tally === undefined) continue;
    const { name, lat, lng, appleId } = stamp;
    tally.strays.push(
      appleId === undefined ? { name, lat, lng } : { name, lat, lng, appleId },
    );
    noteDate(tally, stamp);
  }
}

function displayName(spellings: ReadonlyMap<string, number>): string {
  let best = "";
  let most = 0;
  for (const [spelling, count] of spellings) {
    if (count > most) {
      best = spelling;
      most = count;
    }
  }
  return best;
}

function tier(row: Row): number {
  if (row.lastStamp !== null) return 0;
  return row.stamped > 0 ? 1 : 2;
}

function byRecentStamp(a: Row, b: Row): number {
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  if (a.lastStamp !== null && b.lastStamp !== null) {
    if (a.lastStamp !== b.lastStamp) return b.lastStamp - a.lastStamp;
  }
  if (a.total !== b.total) return b.total - a.total;
  return a.city < b.city ? -1 : a.city > b.city ? 1 : 0;
}

function rowOf(tally: CityTally, visits: readonly VisitMark[]): Row[] {
  const visited = visitMatcher(visits, tally.pins);
  const ticked = tally.pins.filter((pin) => visited(pin)).length;
  const strays = uniquePlacePins(tally.strays).length;
  const total = tally.pins.length + strays;
  if (total === 0) return [];
  return [
    {
      city: displayName(tally.spellings),
      stamped: ticked + strays,
      total,
      lastStamp: tally.lastStamp,
    },
  ];
}

export function completionByCity({
  saves,
  stamps,
  visits,
  savesPerCity,
}: {
  saves: readonly CompletionSave[];
  stamps: readonly CompletionStamp[];
  visits: readonly VisitMark[];
  savesPerCity: number;
}): CityCompletion[] {
  const tallies = new Map<string, CityTally>();
  addSaves(tallies, saves, savesPerCity);
  addStamps(tallies, stamps);
  return [...tallies.values()]
    .flatMap((tally) => rowOf(tally, visits))
    .sort(byRecentStamp)
    .map(({ lastStamp: _lastStamp, ...row }) => row);
}

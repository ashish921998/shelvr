import { type Infer, v } from "convex/values";
import { type VisitMark, visitMatcher } from "./placeVisits";
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

export type CompletionStamp = { city?: string; visitedAt: number };

type CityTally = {
  spellings: Map<string, number>;
  pins: SavePin[];
  savesRead: number;
  stamped: number;
  lastStamp: number | null;
};

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
      pins: [],
      savesRead: 0,
      stamped: 0,
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
      tally.pins.push(...pinsForCity(save, city));
    }
  }
}

function addStamps(
  tallies: Map<string, CityTally>,
  stamps: readonly CompletionStamp[],
): void {
  for (const stamp of stamps) {
    const tally = stamp.city ? tallyFor(tallies, stamp.city) : undefined;
    if (tally === undefined) continue;
    tally.stamped += 1;
    tally.lastStamp = Math.max(tally.lastStamp ?? -Infinity, stamp.visitedAt);
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

function byRecentStamp(a: Row, b: Row): number {
  if (a.lastStamp !== b.lastStamp) {
    if (a.lastStamp === null) return 1;
    if (b.lastStamp === null) return -1;
    return b.lastStamp - a.lastStamp;
  }
  if (a.total !== b.total) return b.total - a.total;
  return a.city < b.city ? -1 : a.city > b.city ? 1 : 0;
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
  const rows = [...tallies.values()].flatMap((tally): Row[] => {
    const pins = uniquePlacePins(tally.pins);
    const visited = visitMatcher(visits, pins);
    const unstamped = pins.filter((pin) => !visited(pin)).length;
    const total = tally.stamped + unstamped;
    if (total === 0) return [];
    return [
      {
        city: displayName(tally.spellings),
        stamped: tally.stamped,
        total,
        lastStamp: tally.lastStamp,
      },
    ];
  });
  return rows
    .sort(byRecentStamp)
    .map(({ lastStamp: _lastStamp, ...row }) => row);
}

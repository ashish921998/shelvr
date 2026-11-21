import type { Id } from "@convex/_generated/dataModel";
import { expect, it } from "vitest";
import {
  type DiscoverPlace,
  discoverBeside,
  mapEntries,
  mapWaits,
  ownOnTop,
  searchEntries,
} from "./map-discover";
import { visitMatcher } from "@convex/model/placeVisits";
import { topSearchResults } from "./map-filters";

const discover = (
  name: string,
  lat: number,
  lng: number,
  appleId = name,
): DiscoverPlace => ({
  _id: name as Id<"places">,
  name,
  lat,
  lng,
  city: "Lisbon",
  appleId,
  kinds: [],
});

const names = (places: DiscoverPlace[]) => places.map((p) => p.name);

it("drops the same Apple id at any distance", () => {
  const own = [{ name: "Mine", lat: 10, lng: 10, appleId: "x" }];
  expect(discoverBeside(own, [discover("Other", 50, 50, "x")])).toEqual([]);
});

it("drops a namesake 100 m away", () => {
  const own = [{ name: "Cafe A", lat: 38.7, lng: -9.1 }];
  expect(
    names(discoverBeside(own, [discover("Cafe A", 38.7009, -9.1)])),
  ).toEqual([]);
});

it("drops a namesake across a band edge", () => {
  const own = [{ name: "Cafe A", lat: 38.70999, lng: -9.1 }];
  expect(discoverBeside(own, [discover("Cafe A", 38.71001, -9.1)])).toEqual([]);
});

it("keeps the same name 2 km away", () => {
  const own = [{ name: "Cafe A", lat: 38.7, lng: -9.1 }];
  expect(
    names(discoverBeside(own, [discover("Cafe A", 38.718, -9.1)])),
  ).toEqual(["Cafe A"]);
});

it("keeps a different name next door", () => {
  const own = [{ name: "Cafe A", lat: 38.7, lng: -9.1 }];
  expect(
    names(discoverBeside(own, [discover("Bar B", 38.7001, -9.1)])),
  ).toEqual(["Bar B"]);
});

it("keeps everything with no own pins", () => {
  expect(
    names(discoverBeside([], [discover("A", 1, 1), discover("B", 2, 2)])),
  ).toEqual(["A", "B"]);
});

it("lists the person's own match first in search, even when Discover places fill the results", () => {
  const own = [{ name: "Cafe Mine", lat: 1, lng: 1 }];
  const many = Array.from({ length: 6 }, (_, i) => discover(`Cafe ${i}`, 2, 2));
  const top = topSearchResults(
    searchEntries(
      mapEntries(own, many, () => false),
      "cafe",
    ),
  );
  expect(top).toHaveLength(5);
  expect(top[0]).toMatchObject({ name: "Cafe Mine", source: "own" });
});

it("lists the person's own match before Discover places whose names start with the search", () => {
  const own = [{ name: "Little Jo", lat: 1, lng: 1 }];
  const many = Array.from({ length: 6 }, (_, i) => discover(`Jo ${i}`, 2, 2));
  const top = topSearchResults(
    searchEntries(
      mapEntries(own, many, () => false),
      "jo",
    ),
  );
  expect(top[0]).toMatchObject({ name: "Little Jo", source: "own" });
  expect(top.slice(1).map((entry) => entry.name)).toEqual([
    "Jo 0",
    "Jo 1",
    "Jo 2",
    "Jo 3",
  ]);
});

it("keeps a pin visited when its visit was marked about 100 m away", () => {
  const own = [{ name: "Little Jo", lat: 38.7009, lng: -9.1 }];
  const visited = visitMatcher(
    [{ key: "littlejo", spots: [{ lat: 38.7, lng: -9.1 }] }],
    own,
  );
  expect(mapEntries(own, [], visited)[0]).toMatchObject({
    source: "own",
    visited: true,
  });
});

it("draws Discover pins first, so the person's own pins sit on top", () => {
  const entries = mapEntries(
    [{ name: "Mine", lat: 1, lng: 1 }],
    [discover("A", 2, 2), discover("B", 3, 3)],
    () => false,
  );
  expect(ownOnTop(entries).map((entry) => entry.name)).toEqual([
    "A",
    "B",
    "Mine",
  ]);
});

const waits = (
  own: readonly unknown[] | undefined,
  discoverSettled: boolean,
  areaShown: boolean,
  askingLocation = false,
) => mapWaits({ own, discoverSettled, areaShown, askingLocation });

it("waits for the person's own places and for the location prompt", () => {
  expect(waits(undefined, true, true)).toBe(true);
  expect(waits([{}], true, true, true)).toBe(true);
});

it("with no saves, waits for the first Discover answer only", () => {
  expect(waits([], false, false)).toBe(true);
  expect(waits([], true, false)).toBe(false);
});

it("keeps the map up while a later area loads, even after a failed one", () => {
  expect(waits([], false, true)).toBe(false);
});

it("never waits for Discover when the person has places", () => {
  expect(waits([{}], false, false)).toBe(false);
});

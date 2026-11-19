import { expect, it } from "vitest";
import { type DiscoverPlace, discoverBeside } from "./map-discover";

const discover = (
  name: string,
  lat: number,
  lng: number,
  appleId = name,
): DiscoverPlace =>
  ({
    _id: name,
    name,
    lat,
    lng,
    city: "Lisbon",
    appleId,
    kinds: [],
  }) as unknown as DiscoverPlace;

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

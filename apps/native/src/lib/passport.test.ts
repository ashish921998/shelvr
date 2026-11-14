import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  CARD_PLACES,
  shareCardOf,
  type Stamp,
  stampDate,
  unstampedCities,
  wentInCity,
} from "./passport";

const ITEM = "item1" as Id<"items">;

function stamp(over: Partial<Stamp> = {}): Stamp {
  return {
    key: "tigre",
    name: "Tigre",
    itemId: ITEM,
    visitedAt: 5,
    cover: null,
    ...over,
  };
}

describe("stampDate", () => {
  it("gives a place from before Shelvr no date", () => {
    expect(stampDate(stamp({ backfilled: true }))).toBeNull();
    expect(stampDate(stamp())).toBe(5);
  });
});

describe("grouping by city", () => {
  it("groups places to stamp by city in the order they come", () => {
    const place = { itemId: ITEM, cover: null, spot: { lat: 1, lng: 2 } };
    const groups = unstampedCities([
      { ...place, name: "Tigre", city: "Lisbon" },
      { ...place, name: "Majestic", city: "Porto" },
      { ...place, name: "Dante", city: "LISBON" },
    ]);
    expect(groups.map((group) => [group.city, group.places.length])).toEqual([
      ["Lisbon", 2],
      ["Porto", 1],
    ]);
  });

  it("counts the places someone went to in one city", () => {
    const stamps = [
      stamp({ key: "a", city: "Lisbon" }),
      stamp({ key: "b", city: " lisbon" }),
      stamp({ key: "c", city: "Porto" }),
    ];
    expect(wentInCity(stamps, "Lisbon")).toBe(2);
    expect(wentInCity(undefined, "Lisbon")).toBeNull();
  });
});

describe("shareCardOf", () => {
  it("numbers the city's places and pins only the located ones", () => {
    const card = shareCardOf(
      [
        stamp({ key: "a", name: "Tigre", city: "Lisbon", lat: 1, lng: 2 }),
        stamp({ key: "b", name: "Majestic", city: "Porto", lat: 3, lng: 4 }),
        stamp({ key: "c", name: "Dante", city: "lisbon", visitedAt: 9 }),
      ],
      "Lisbon",
    );
    expect(card).toEqual({
      total: 2,
      month: 5,
      savedOn: "elsewhere",
      places: [
        { number: 1, name: "Tigre", lat: 1, lng: 2 },
        { number: 2, name: "Dante" },
      ],
    });
  });

  it("names the app the city's places were saved from", () => {
    const savedOn = (...sources: Stamp["source"][]) =>
      shareCardOf(
        sources.map((source, index) =>
          stamp({ key: String(index), city: "Lisbon", source }),
        ),
        "Lisbon",
      ).savedOn;
    expect(savedOn("instagram", undefined)).toBe("instagram");
    expect(savedOn("tiktok")).toBe("tiktok");
    expect(savedOn("tiktok", "instagram")).toBe("both");
    expect(savedOn(undefined)).toBe("elsewhere");
  });

  it("has no month when every place was stamped as from before", () => {
    const card = shareCardOf(
      [stamp({ city: "Lisbon", backfilled: true })],
      "Lisbon",
    );
    expect(card.month).toBeNull();
  });

  it("lists at most a card's worth of places but counts them all", () => {
    const stamps = Array.from({ length: CARD_PLACES + 3 }, (_, index) =>
      stamp({ key: String(index), name: `P${index}`, city: "Lisbon" }),
    );
    const card = shareCardOf(stamps, "Lisbon");
    expect(card.total).toBe(CARD_PLACES + 3);
    expect(card.places).toHaveLength(CARD_PLACES);
  });
});

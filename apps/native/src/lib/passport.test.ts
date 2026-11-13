import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  CARD_PLACES,
  completionFor,
  passportSections,
  shareCardOf,
  type Stamp,
  stampDate,
  unstampedCities,
  unstampedIn,
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
    expect(wentInCity(undefined, "Lisbon")).toBe(0);
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

function row(city: string, stamped: number, total: number) {
  return { city, stamped, total };
}

describe("passportSections", () => {
  it("puts each stamped city's ring on its stamps, matching the city however it is spelled", () => {
    const { stamped, waiting } = passportSections(
      [
        stamp({ city: "lisbon " }),
        stamp({ key: "majestic", city: "Porto" }),
        stamp({ key: "dante", city: "Lisbon" }),
      ],
      [row("Porto", 1, 4), row("Lisbon", 2, 2)],
    );
    expect(
      stamped.map((section) => [
        section.city,
        section.stamps.length,
        section.completion,
      ]),
    ).toEqual([
      ["Lisbon", 2, row("Lisbon", 2, 2)],
      ["Porto", 1, row("Porto", 1, 4)],
    ]);
    expect(waiting).toEqual([]);
  });

  it("lists cities with saves and no stamps after the stamped ones, without stamps", () => {
    const { stamped, waiting } = passportSections(
      [stamp({ city: "Lisbon" })],
      [row("Lisbon", 1, 3), row("Tokyo", 0, 12), row("Paris", 0, 2)],
    );
    expect(stamped.map((section) => section.city)).toEqual(["Lisbon"]);
    expect(
      waiting.map((section) => [section.city, section.stamps, section.key]),
    ).toEqual([
      ["Tokyo", [], "tokyo"],
      ["Paris", [], "paris"],
    ]);
  });

  it("keeps stamps with no city last, and a ring whose stamps sit under another spelling before them", () => {
    const { stamped, waiting } = passportSections(
      [stamp({ city: "Lisbon" }), stamp({ key: "x", city: undefined })],
      [row("Lisbon", 1, 1), row("Kyoto", 2, 5)],
    );
    expect(
      stamped.map((section) => [section.city, section.completion?.total]),
    ).toEqual([
      ["Lisbon", 1],
      ["Kyoto", 5],
      [null, undefined],
    ]);
    expect(stamped.at(-1)?.stamps).toHaveLength(1);
    expect(waiting).toEqual([]);
  });

  it("shows the stamps alone while the rings have not loaded", () => {
    const { stamped } = passportSections([stamp({ city: "Lisbon" })], []);
    expect(stamped).toMatchObject([{ city: "Lisbon", completion: null }]);
  });
});

describe("next to stamp", () => {
  const place = { itemId: ITEM, cover: null, spot: { lat: 1, lng: 2 } };
  const places = [
    { ...place, name: "Tigre", city: "Lisbon" },
    { ...place, name: "Majestic", city: "Porto" },
    { ...place, name: "Dante", city: "LISBON" },
  ];

  it("lists only the city's unstamped places, whatever the spelling", () => {
    expect(unstampedIn(places, "lisbon").map((p) => p.name)).toEqual([
      "Tigre",
      "Dante",
    ]);
    expect(unstampedIn(places, "Kyoto")).toEqual([]);
  });

  it("finds the city's ring by name", () => {
    const rows = [row("Lisbon", 2, 5), row("Porto", 0, 1)];
    expect(completionFor(rows, "LISBON")).toEqual(row("Lisbon", 2, 5));
    expect(completionFor(rows, "Kyoto")).toBeUndefined();
    expect(completionFor(undefined, "Lisbon")).toBeUndefined();
  });
});

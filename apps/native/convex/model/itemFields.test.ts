import { describe, expect, it } from "vitest";
import {
  MAX_ITEM_CITIES,
  MAX_ITEM_PLACES,
  normalizeCities,
  normalizePlaces,
  normalizePlaceLocations,
} from "./itemFields";

describe("normalizePlaceLocations", () => {
  it("keeps only bounded clues for named places, matching normalized names", () => {
    expect(
      normalizePlaceLocations(
        [
          { name: " carette, Paris ", location: " Place  du Trocadéro " },
          { name: "Carette", location: "Place des Vosges" },
          { name: "Invented", location: "Somewhere" },
          { name: "Louvre", location: " " },
          { name: "Cafe", location: "x".repeat(121) },
        ],
        ["Carette", "Louvre", "Cafe"],
        ["Paris"],
      ),
    ).toEqual([{ name: "Carette", location: "Place du Trocadéro" }]);
    expect(normalizePlaceLocations(undefined, ["Carette"])).toEqual([]);
    expect(
      normalizePlaceLocations(
        [{ name: "Carette", location: "Paris" }],
        undefined,
      ),
    ).toEqual([]);
  });
  it("keeps multi-city branch clues attached to their qualified names", () => {
    expect(
      normalizePlaceLocations(
        [
          { name: "Cafe, Paris", location: "Rue Royale" },
          { name: "Cafe, Lyon", location: "Rue Victor Hugo" },
        ],
        ["Cafe, Paris", "Cafe, Lyon"],
        ["Paris", "Lyon"],
      ),
    ).toEqual([
      { name: "Cafe, Paris", location: "Rue Royale" },
      { name: "Cafe, Lyon", location: "Rue Victor Hugo" },
    ]);
  });
  it("keeps one clue for a respelled place, the newest spelling and clue first", () => {
    expect(
      normalizePlaceLocations(
        [
          { name: "Café Joe’s", location: "Rue Neuve" },
          { name: "Cafe Joe's", location: "Rue Vieille" },
        ],
        ["Café Joe’s", "Cafe Joe's"],
        ["Paris"],
      ),
    ).toEqual([{ name: "Café Joe’s", location: "Rue Neuve" }]);
  });
});

describe("normalizeCities", () => {
  it("trims, single-spaces and drops trailing punctuation", () => {
    expect(normalizeCities(["  New   York. ", "Goa,"])).toEqual([
      "New York",
      "Goa",
    ]);
  });

  it("trims the space left behind by trailing punctuation", () => {
    expect(normalizeCities(["Goa .", "Paris !"])).toEqual(["Goa", "Paris"]);
  });

  it("keeps one entry per city, ignoring case, in first-seen order", () => {
    expect(normalizeCities(["Mumbai", "mumbai", "Goa", "MUMBAI"])).toEqual([
      "Mumbai",
      "Goa",
    ]);
  });

  it("drops empty entries, placeholders and runaway text", () => {
    expect(
      normalizeCities(["", "  ", "Unknown", "n/a", "x".repeat(61), "Paris"]),
    ).toEqual(["Paris"]);
  });

  it("caps the list", () => {
    expect(
      normalizeCities(
        Array.from({ length: MAX_ITEM_CITIES + 2 }, (_, i) => `City ${i}`),
      ),
    ).toHaveLength(MAX_ITEM_CITIES);
  });

  it("treats a missing answer as no cities", () => {
    expect(normalizeCities(undefined)).toEqual([]);
  });
});

describe("normalizePlaces", () => {
  it("removes only the sole source city's trailing qualifier before deduplication", () => {
    expect(
      normalizePlaces(
        [
          " Guest House, AUSTIN. ",
          "Guest House",
          "Cafe, Downtown, Austin",
          "Austin Java",
          "Cafe, Dallas",
        ],
        [" Austin ", "austin"],
      ),
    ).toEqual(["Guest House", "Cafe, Downtown", "Austin Java", "Cafe, Dallas"]);
  });

  it("removes a sole source city that itself contains a comma", () => {
    expect(
      normalizePlaces(
        ["Founding Farmers, Washington, D.C.", "Founding Farmers", "D.C"],
        ["Washington, D.C."],
      ),
    ).toEqual(["Founding Farmers", "D.C"]);
  });

  it("keeps city qualifiers when the source has multiple cities or no city", () => {
    const places = ["Cafe, Austin", "Cafe, Dallas"];
    expect(normalizePlaces(places, ["Austin", "Dallas"])).toEqual(places);
    expect(normalizePlaces(places)).toEqual(places);
  });

  it("keeps each place once, ignoring case, tidied, in first-seen order", () => {
    expect(
      normalizePlaces([" Café  de Flore. ", "Santelmo", "café de flore", ""]),
    ).toEqual(["Café de Flore", "Santelmo"]);
  });

  it("drops runaway text and caps the list", () => {
    expect(normalizePlaces(["x".repeat(81), "Intenso"])).toEqual(["Intenso"]);
    const many = Array.from({ length: 40 }, (_, i) => `Place ${i}`);
    expect(normalizePlaces(many)).toHaveLength(MAX_ITEM_PLACES);
  });

  it("trims the space left behind by trailing punctuation", () => {
    expect(normalizePlaces(["Café de Flore .", "café de flore"])).toEqual([
      "Café de Flore",
    ]);
  });

  it("reads a missing list as none", () => {
    expect(normalizePlaces(undefined)).toEqual([]);
  });
});

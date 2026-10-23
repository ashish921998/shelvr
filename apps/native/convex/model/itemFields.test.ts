import { describe, expect, it } from "vitest";
import {
  MAX_ITEM_CITIES,
  MAX_ITEM_PLACES,
  normalizeCities,
  normalizePlaces,
} from "./itemFields";

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
    expect(normalizeCities(["A", "B", "C", "D", "E"])).toHaveLength(
      MAX_ITEM_CITIES,
    );
  });

  it("treats a missing answer as no cities", () => {
    expect(normalizeCities(undefined)).toEqual([]);
  });
});

describe("normalizePlaces", () => {
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

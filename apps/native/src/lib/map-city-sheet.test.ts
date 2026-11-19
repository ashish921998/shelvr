import { expect, it } from "vitest";
import type { StampSave } from "./map-stamps";
import { citySummary, recentSaves } from "./map-city-sheet";

const bar = { name: "Bar", lat: 40.7, lng: -74 };

const save = (overrides: Partial<StampSave>): StampSave => ({
  _id: "a",
  _creationTime: 1,
  url: "https://www.instagram.com/reel/abc/",
  imageUrl: "https://cdn.example/a.jpg",
  placePins: [bar],
  ...overrides,
});

it("lists saves with a cover newest first, at most twelve", () => {
  const saves = Array.from({ length: 14 }, (_, index) =>
    save({ _id: String(index), _creationTime: index }),
  );
  saves.push(save({ _id: "blank", _creationTime: 99, imageUrl: null }));
  const recent = recentSaves(saves);
  expect(recent).toHaveLength(12);
  expect(recent[0]!._id).toBe("13");
  expect(recent.some((item) => item._id === "blank")).toBe(false);
});

it("sums the city's saves and places", () => {
  expect(citySummary(4, 14)).toBe("4 saves · 14 places");
  expect(citySummary(1, 1)).toBe("1 save · 1 place");
});

import { expect, it } from "vitest";
import {
  citySummary,
  recentSaves,
  saveCardDetail,
  type SheetSave,
} from "./map-city-sheet";

const bar = { name: "Bar", lat: 40.7, lng: -74 };

const save = (overrides: Partial<SheetSave>): SheetSave => ({
  _id: "a",
  _creationTime: 1,
  url: "https://www.instagram.com/reel/abc/",
  imageUrl: "https://cdn.example/a.jpg",
  placePins: [bar],
  author: "beli_eats",
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

it("credits a reel's author with an @ and counts its places", () => {
  expect(saveCardDetail(save({}))).toBe("1 place · @beli_eats");
  expect(saveCardDetail(save({ author: "@beli_eats" }))).toBe(
    "1 place · @beli_eats",
  );
});

it("shows only the credit when the save has no places", () => {
  expect(saveCardDetail(save({ placePins: [] }))).toBe("@beli_eats");
});

it("credits a web page by its author without an @", () => {
  expect(
    saveCardDetail(save({ url: "https://example.com/guide", author: "Eater" })),
  ).toBe("1 place · Eater");
});

it("sums the city's saves and places", () => {
  expect(citySummary(4, 14)).toBe("4 saves · 14 places");
  expect(citySummary(1, 1)).toBe("1 save · 1 place");
});

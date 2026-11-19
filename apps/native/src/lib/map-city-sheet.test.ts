import { expect, it } from "vitest";
import { citySummary, recentSaves, type SheetSave } from "./map-city-sheet";

const save = (overrides: Partial<SheetSave>): SheetSave => ({
  _id: "a",
  _creationTime: 1,
  imageUrl: "https://cdn.example/a.jpg",
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

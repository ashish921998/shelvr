import { describe, expect, it } from "vitest";
import { countLabel, saveDays, saveDetail } from "./save-list";

const NOW = new Date(2026, 10, 6, 15).getTime();
const savedAt = (year: number, month: number, day: number, hour: number) => ({
  _creationTime: new Date(year, month, day, hour).getTime(),
});

describe("saveDays", () => {
  it("puts saves under Today, Yesterday and their dates, newest first", () => {
    const saves = [
      savedAt(2026, 10, 6, 9),
      savedAt(2026, 10, 6, 0),
      savedAt(2026, 10, 5, 23),
      savedAt(2026, 10, 3, 18),
      savedAt(2026, 10, 3, 8),
      savedAt(2025, 9, 28, 12),
    ];
    expect(
      saveDays(saves, NOW).map((day) => [day.title, day.saves.length]),
    ).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Tue, Nov 3", 2],
      ["Tue, Oct 28, 2025", 1],
    ]);
  });

  it("keeps every save, in order, under a day", () => {
    const saves = [savedAt(2026, 10, 6, 9), savedAt(2026, 10, 1, 9)];
    expect(saveDays(saves, NOW).flatMap((day) => day.saves)).toEqual(saves);
  });
});

describe("saveDetail", () => {
  const ready = {
    _id: "a",
    status: "ready" as const,
    cities: ["Tokyo", "Kyoto"],
    tags: ["coffee"],
  };

  it("names the kind of place and its first city", () => {
    expect(saveDetail(ready)).toBe("Coffee · Tokyo");
  });

  it("names only the city when no tag says what kind of place it is", () => {
    expect(saveDetail({ ...ready, tags: ["weekend"] })).toBe("Tokyo");
  });

  it.each([
    ["still reading", { status: "processing" as const }, "Finding places…"],
    ["failed", { status: "failed" as const }, "Couldn't read this link"],
    [
      "only partly read",
      { status: "ready" as const, enrichment: "partial" },
      "Couldn't read this link",
    ],
    ["without a place", { status: "ready" as const }, "No place in this one"],
  ])("says why a save %s has no city", (_name, save, line) => {
    expect(saveDetail({ _id: "a", tags: [], ...save })).toBe(line);
  });
});

describe("countLabel", () => {
  it.each([
    [23, false, "23"],
    [1200, false, "1,200"],
    [40, true, "40+"],
  ])("shows %i with more to load %s as %s", (count, more, label) => {
    expect(countLabel(count, more)).toBe(label);
  });
});

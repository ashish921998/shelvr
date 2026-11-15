import { describe, expect, it } from "vitest";

import type { CityStamp } from "@/lib/city-stamp-data";
import type { Stamp } from "@/lib/passport";
import {
  STORY_PHOTOS,
  darkRuns,
  passportStoryOf,
  qrModules,
} from "@/lib/passport-story";

function stamp(name: string, extra: Partial<Stamp> = {}): Stamp {
  return {
    key: name.toLowerCase(),
    name,
    visitedAt: 1_700_000_000_000,
    cover: null,
    ...extra,
  } as Stamp;
}

describe("passportStoryOf", () => {
  it("leads with photos, newest first, and counts the rest as more", () => {
    const stamps = [
      stamp("Old photo", { cover: "a.jpg", visitedAt: 1 }),
      stamp("No photo", { visitedAt: 9 }),
      stamp("New photo", { cover: "b.jpg", visitedAt: 5 }),
      ...Array.from({ length: 4 }, (_, i) =>
        stamp(`Extra ${i}`, { visitedAt: 0 }),
      ),
    ];
    const story = passportStoryOf(stamps, []);
    expect(story.photos).toHaveLength(STORY_PHOTOS);
    expect(story.photos.slice(0, 3).map((s) => s.name)).toEqual([
      "New photo",
      "Old photo",
      "No photo",
    ]);
    expect(story.places).toBe(7);
    expect(story.more).toBe(3);
  });

  it("says reels only when a stamp came from Instagram or TikTok", () => {
    expect(passportStoryOf([stamp("Cafe")], []).fromReels).toBe(false);
    expect(
      passportStoryOf([stamp("Cafe", { source: "tiktok" })], []).fromReels,
    ).toBe(true);
  });

  it("shows city stamps first, then the busiest stamped cities", () => {
    const cityStamps = [
      { city: "lisbon", country: "PORTUGAL", stampedAt: 2 },
    ] as CityStamp[];
    const stamps = [
      stamp("A", { city: "Porto" }),
      stamp("B", { city: "Madrid" }),
      stamp("C", { city: "Madrid" }),
      stamp("D", { city: "Lisbon" }),
    ];
    const story = passportStoryOf(stamps, cityStamps, (city) =>
      city === "lisbon" ? "Lisbon" : city,
    );
    expect(story.cityStamps).toEqual([
      { name: "Lisbon", country: "PORTUGAL" },
      { name: "Madrid", country: null },
    ]);
  });
});

describe("qrModules", () => {
  it("builds a square code with finder patterns in three corners", () => {
    const rows = qrModules("https://shelvr.app/passport/abc123");
    const size = rows.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect(rows.every((row) => row.length === size)).toBe(true);
    for (const [r, c] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      expect(rows[r].slice(c, c + 7).every(Boolean)).toBe(true);
    }
  });
});

describe("darkRuns", () => {
  it("merges neighbouring dark modules into runs", () => {
    expect(darkRuns([true, true, false, true, false, false, true])).toEqual([
      [0, 2],
      [3, 1],
      [6, 1],
    ]);
    expect(darkRuns([false, false])).toEqual([]);
  });
});

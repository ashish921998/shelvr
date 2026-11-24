import { describe, expect, it, vi } from "vitest";

import type { CityStamp } from "@/lib/city-stamp-data";
import type { Stamp } from "@/lib/passport";
import {
  STORY_PHOTOS,
  darkRuns,
  passportStoryOf,
  qrModules,
} from "@/lib/passport-story";

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: vi.fn() },
}));

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
  it("shows only stamps with a photo, newest first, and counts the rest as more", () => {
    const stamps = [
      stamp("Old photo", { cover: "a.jpg", visitedAt: 1 }),
      stamp("No photo", { visitedAt: 9 }),
      stamp("New photo", { cover: "b.jpg", visitedAt: 5 }),
      ...Array.from({ length: 4 }, (_, i) =>
        stamp(`Photo ${i}`, { cover: `${i}.jpg`, visitedAt: 0 }),
      ),
    ];
    const story = passportStoryOf(stamps, []);
    expect(story.photos).toHaveLength(STORY_PHOTOS);
    expect(story.photos.slice(0, 2).map((s) => s.name)).toEqual([
      "New photo",
      "Old photo",
    ]);
    expect(story.photos.some((s) => s.cover === null)).toBe(false);
    expect(story.places).toBe(7);
    expect(story.more).toBe(3);
  });

  it("leaves photo slots empty when no stamp has a photo", () => {
    const story = passportStoryOf([stamp("A"), stamp("B")], []);
    expect(story.photos).toEqual([]);
    expect(story.more).toBe(2);
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
      stamp("B", { city: "Madrid", countryCode: "ES" }),
      stamp("C", { city: "Madrid" }),
      stamp("D", { city: "Lisbon" }),
    ];
    const story = passportStoryOf(stamps, cityStamps, (city) =>
      city === "lisbon" ? "Lisbon" : city,
    );
    expect(story.cityStamps).toEqual([
      { name: "Lisbon", country: "PORTUGAL" },
      { name: "Madrid", country: "ES" },
    ]);
  });

  it("does not repeat a city stamp whose label is translated", () => {
    const cityStamps = [
      { city: "lisbon", country: "PORTUGAL", stampedAt: 2 },
    ] as CityStamp[];
    const stamps = [
      stamp("A", { city: "Lisbon" }),
      stamp("B", { city: "Lisbon" }),
      stamp("C", { city: "Porto" }),
    ];
    const story = passportStoryOf(stamps, cityStamps, () => "Lisbonne");
    expect(story.cityStamps.map((city) => city.name)).toEqual([
      "Lisbonne",
      "Porto",
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

it("keeps the native Passport story vector in sync", async () => {
  const { default: vector } =
    await import("../../../ios/TestData/passport-story.json");
  const sources = ["instagram", "tiktok"] as const;
  const stamps = vector.stamps.map((place) => ({
    ...place,
    source: sources.find((source) => source === place.source),
  }));
  const story = passportStoryOf(stamps, vector.cities, () => "Lisboa");
  expect({
    places: story.places,
    cities: story.cities,
    countries: story.countries,
    fromReels: story.fromReels,
    more: story.more,
    photos: story.photos.map((place) => place.name),
    cityNames: story.cityStamps.map((city) => city.name),
  }).toEqual(vector.expected);
});

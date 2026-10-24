import { distanceKm } from "@convex/model/trip";
import { describe, expect, it } from "vitest";
import { ahaReel, ahaReelUrl } from "./aha-reels";
import { AHA_SPOTS, ahaSample } from "./aha-sample";
import { SAMPLE_CITY_IDS } from "./sample-cities";
import { planCities } from "./sample-plans";

const KINDS = ["date", "trip", "weekend"] as const;
const reels = KINDS.flatMap((kind) =>
  SAMPLE_CITY_IDS.flatMap((city) => {
    const reel = ahaReel(kind, city);
    return reel === null ? [] : [{ kind, city, reel }];
  }),
);

describe("ahaSample", () => {
  it.each(["date", "trip", "weekend"] as const)(
    "names three spots of a %s, in plan order, in every city",
    (kind) => {
      for (const city of [...SAMPLE_CITY_IDS, null]) {
        const sample = ahaSample(kind, city);
        expect(sample.spots).toHaveLength(AHA_SPOTS);
        expect(sample.trip.days).toHaveLength(1);
        expect(sample.trip.days[0].stops).toEqual(
          sample.spots.map((spot) => spot.stop),
        );
        expect(sample.spots.map((spot) => spot.number)).toEqual([1, 2, 3]);
      }
    },
  );

  it("draws the picked city when the plan covers it, and Prague when not", () => {
    const [covered] = planCities("date");
    expect(ahaSample("date", covered).city).toBe(covered);
    expect(ahaSample("date", null).city).toBe("prague");
  });

  it("credits a made-up account named for the city where there is no reel", () => {
    expect(ahaSample("date", "prague")).toMatchObject({
      reel: null,
      handle: "@prague.eats",
    });
    expect(ahaSample("trip", "lisbon").handle).toBe("@lisbon.trips");
  });

  it.each(reels.map((entry) => [entry.kind, entry.city, entry]))(
    "pins the %s reel's first three places in %s in its video's order and credits its creator",
    (kind, city, { reel }) => {
      const sample = ahaSample(kind, city);
      expect(sample.reel).toBe(reel);
      expect(sample.handle).toBe(`@${reel.handle}`);
      expect(sample.spots.map((spot) => spot.stop.name)).toEqual(
        reel.places.slice(0, AHA_SPOTS).map(([, name]) => name),
      );
    },
  );
});

describe("ahaReel", () => {
  it("has a reel for each plan in each of the five pilot cities", () => {
    for (const kind of KINDS)
      for (const city of [
        "austin",
        "new-york",
        "los-angeles",
        "chicago",
        "san-francisco",
      ] as const)
        expect(ahaReel(kind, city), `${kind} in ${city}`).not.toBeNull();
  });

  it("plays every reel once, and keeps each one's places together in its city", () => {
    expect(new Set(reels.map(({ reel }) => reel.code)).size).toBe(reels.length);
    for (const { reel } of reels) {
      expect(reel.places.length).toBeGreaterThanOrEqual(AHA_SPOTS);
      const [first, ...rest] = reel.places.map(([, , lat, lng]) => ({
        lat,
        lng,
      }));
      for (const at of rest)
        expect(distanceKm(first, at), reel.code).toBeLessThan(30);
    }
  });

  it("links the reel the way a share from Instagram does", () => {
    const [{ reel }] = reels;
    expect(ahaReelUrl(reel)).toBe(
      `https://www.instagram.com/reel/${reel.code}/`,
    );
  });
});

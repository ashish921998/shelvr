import { distanceKm } from "@convex/model/trip";
import { describe, expect, it } from "vitest";
import { ahaReel, ahaReelUrl } from "./aha-reels";
import { AHA_SPOTS, ahaSample } from "./aha-sample";
import { SAMPLE_CITY_IDS } from "./sample-cities";

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
        expect(sample.trip.days[0].stops.map((stop) => stop.name)).toEqual(
          sample.spots.map((spot) => spot.name),
        );
      }
    },
  );

  it.each(KINDS)(
    "provides a saveable %s reel even for skipped or unsupported city choices",
    (kind) => {
      for (const city of [...SAMPLE_CITY_IDS, null]) {
        const sample = ahaSample(kind, city);
        const reel = ahaReel(kind, sample.city);
        expect(reel).not.toBeNull();
        expect(sample.source).toBe("reel");
        expect(sample.firstSaveUrl).toBe(ahaReelUrl(reel!));
        expect(sample.city).toBe(
          city !== null && ahaReel(kind, city) ? city : "austin",
        );
        expect(sample.trip.city).toBe(sample.city);
        expect(sample.spots.some((spot) => "quote" in spot)).toBe(false);
      }
    },
  );

  it.each(reels.map((entry) => [entry.kind, entry.city, entry]))(
    "pins the %s reel's first three places in %s in its video's order and credits its creator",
    (kind, city, { reel }) => {
      const sample = ahaSample(kind, city);
      expect(sample).toMatchObject({
        source: "reel",
        creator: `@${reel.handle}`,
        videoCode: reel.code,
        firstSaveUrl: ahaReelUrl(reel),
      });
      expect(sample).not.toHaveProperty("caption");
      expect(sample.spots.some((spot) => "quote" in spot)).toBe(false);
      expect(sample.spots.map((spot) => spot.name)).toEqual(
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

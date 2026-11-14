import { distanceKm } from "@convex/model/trip";
import { describe, expect, it } from "vitest";
import { ahaReel, ahaReelUrl } from "./aha-reels";
import { AHA_SPOTS, ahaSample } from "./aha-sample";
import { SAMPLE_CITY_IDS } from "./sample-cities";

const KINDS = ["date", "trip", "weekend"] as const;
const reels = SAMPLE_CITY_IDS.map((city) => ({ city, reel: ahaReel(city) }));

describe("ahaSample", () => {
  it.each(KINDS)(
    "names three spots of a %s, in the reel's order, in every city",
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
    "plays the picked city's own reel for a %s, and Austin's when no city was picked",
    (kind) => {
      for (const city of SAMPLE_CITY_IDS) {
        const sample = ahaSample(kind, city);
        expect(sample.city).toBe(city);
        expect(sample.trip.city).toBe(city);
        expect(sample.firstSaveUrl).toBe(ahaReelUrl(ahaReel(city)));
      }
      expect(ahaSample(kind, null).city).toBe("austin");
    },
  );

  it.each(reels.map((entry) => [entry.city, entry]))(
    "pins the %s reel's three places in its order and credits its creator",
    (city, { reel }) => {
      const sample = ahaSample("date", city);
      expect(sample).toMatchObject({
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
  it("plays a different reel in every city", () => {
    expect(new Set(reels.map(({ reel }) => reel.code)).size).toBe(
      SAMPLE_CITY_IDS.length,
    );
  });

  it.each(reels.map((entry) => [entry.city, entry]))(
    "keeps the %s reel's places together",
    (city, { reel }) => {
      expect(reel.places.length).toBeGreaterThanOrEqual(AHA_SPOTS);
      const [first, ...rest] = reel.places.map(([, , lat, lng]) => ({
        lat,
        lng,
      }));
      for (const at of rest)
        expect(distanceKm(first, at), city).toBeLessThan(30);
    },
  );

  it("links the reel the way a share from Instagram does", () => {
    const reel = ahaReel("austin");
    expect(ahaReelUrl(reel)).toBe(
      `https://www.instagram.com/reel/${reel.code}/`,
    );
  });
});

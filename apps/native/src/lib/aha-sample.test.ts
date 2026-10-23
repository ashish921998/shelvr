import { describe, expect, it } from "vitest";
import { AHA_SPOTS, ahaSample, walkMinutes } from "./aha-sample";
import { SAMPLE_CITY_IDS } from "./sample-cities";
import { planCities } from "./sample-plans";

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
        expect(sample.spots[0].walk).toBeNull();
        for (const spot of sample.spots.slice(1))
          expect(spot.walk).toBeGreaterThanOrEqual(1);
        const times = sample.spots.map((spot) => spot.time);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
      }
    },
  );

  it("draws the picked city when the plan covers it, and Prague when not", () => {
    const [covered] = planCities("date");
    expect(ahaSample("date", covered).city).toBe(covered);
    expect(ahaSample("date", null).city).toBe("prague");
  });

  it("credits a made-up account named for the city", () => {
    expect(ahaSample("date", "los-angeles").handle).toBe("@losangeles.eats");
    expect(ahaSample("trip", "lisbon").handle).toBe("@lisbon.trips");
  });
});

it("counts a walk of a kilometre as about a quarter of an hour", () => {
  const minutes = walkMinutes(
    { lat: 50.0866, lng: 14.4096 },
    { lat: 50.0956, lng: 14.4096 },
  );
  expect(minutes).toBeGreaterThanOrEqual(12);
  expect(minutes).toBeLessThanOrEqual(16);
});

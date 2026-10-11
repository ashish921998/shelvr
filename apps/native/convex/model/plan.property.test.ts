import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import { sanitizePlan, type PlanSource } from "./plan";

const SEED = 20261011;

const CITIES = [
  "New York",
  "London",
  "Paris",
  "Tokyo",
  "Chicago",
  "Sydney",
  "Berlin",
  "Toronto",
];
const NEIGHBOURHOODS = ["SoHo", "Chelsea", "Shoreditch", "Marais", "Shibuya"];

function source(title: string): PlanSource {
  return { itemId: "item1" as Id<"items">, places: [], title };
}

const place = fc.record({
  neighbourhood: fc.constantFrom(...NEIGHBOURHOODS),
  savedCity: fc.constantFrom(...CITIES),
  pickedCity: fc.constantFrom(...CITIES),
});

describe("sanitizePlan area grounding", () => {
  it("never keeps a city the save does not name", () => {
    fc.assert(
      fc.property(place, ({ neighbourhood, savedCity, pickedCity }) => {
        const sources = [source(`Balthazar in ${neighbourhood}, ${savedCity}`)];
        const [pick] = sanitizePlan(
          [
            {
              saveNumber: 1,
              name: "Balthazar",
              area: `${neighbourhood}, ${pickedCity}`,
              why: "Go",
            },
          ],
          sources,
        );
        const expected =
          pickedCity === savedCity
            ? `${neighbourhood}, ${pickedCity}`
            : neighbourhood;
        expect(pick.area).toBe(expected);
      }),
      { seed: SEED, numRuns: 200 },
    );
  });
});

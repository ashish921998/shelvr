import { describe, expect, it } from "vitest";
import {
  GOALS,
  GOAL_PLANS,
  goalFlow,
  goalShareSample,
  isGoal,
  isPracticePost,
} from "./onboarding-goals";
import { SAMPLE_CITY_IDS } from "./sample-cities";
import { planAsCity, planCities } from "./sample-plans";

describe("goalFlow", () => {
  it.each(["travel", "food", "date"] as const)(
    "takes %s through a city, the share, the sample, the promise and notifications",
    (goal) => {
      expect(goalFlow(goal)).toEqual([
        "opener",
        "goal",
        "city",
        "share",
        "tripBuild",
        "tripReveal",
        "promise",
        "notifications",
      ]);
    },
  );

  it("takes recipes straight from the share to the sample recipe, with no city", () => {
    expect(goalFlow("recipes")).toEqual([
      "opener",
      "goal",
      "share",
      "recipeReveal",
      "promise",
      "notifications",
    ]);
  });

  it("keeps the topics for something else, with no sample", () => {
    expect(goalFlow("other")).toEqual([
      "opener",
      "goal",
      "interests",
      "share",
      "promise",
      "notifications",
    ]);
  });
});

describe("goalShareSample", () => {
  it.each(["food", "date"] as const)(
    "offers a %s post that is a stop in the sample the person sees next, in every city",
    (goal) => {
      const kind = GOAL_PLANS[goal]!;
      for (const city of [...SAMPLE_CITY_IDS, null]) {
        const sample = goalShareSample(goal, city)!;
        const drawn = planCities(kind).includes(city!) ? city : "prague";
        expect(sample.city).toBe(drawn);
        const stops = planAsCity(
          kind as "date" | "weekend",
          drawn!,
        ).days.flatMap((day) => day.stops.map((stop) => stop.name));
        expect(stops).toContain(sample.pageHeading);
        expect(isPracticePost(sample.url)).toBe(true);
      }
    },
  );

  it("offers the picked city's travel post", () => {
    expect(goalShareSample("travel", "lisbon")?.city).toBe("lisbon");
    expect(goalShareSample("travel", null)?.domain).toBe("prague.eu");
  });

  it("offers the recipe post for recipes, wherever the person is", () => {
    const sample = goalShareSample("recipes", "paris");
    expect(sample?.kind).toBe("Recipes");
    expect(isPracticePost(sample!.url)).toBe(true);
  });

  it("leaves something else to the topics", () => {
    expect(goalShareSample("other", "paris")).toBeUndefined();
  });
});

describe("isPracticePost", () => {
  it("does not take a link the person found on their own for practice", () => {
    expect(isPracticePost("https://example.com/my-own")).toBe(false);
  });
});

it("knows only the goals onboarding asks", () => {
  for (const goal of GOALS) expect(isGoal(goal)).toBe(true);
  expect(isGoal("shopping")).toBe(false);
  expect(isGoal(undefined)).toBe(false);
});

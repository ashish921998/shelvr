import { describe, expect, it } from "vitest";
import {
  GOALS,
  cityQuestion,
  goalSpaces,
  isGoal,
  isSavedCount,
  planKindFor,
  primaryGoal,
  readGoals,
} from "./onboarding-goals";

describe("planKindFor", () => {
  it.each([
    [["date", "travel", "food"], "date"],
    [["food", "date"], "date"],
    [["food", "travel"], "trip"],
    [["travel"], "trip"],
    [["food"], "weekend"],
    [[], "weekend"],
  ] as const)("shows %j a %s", (goals, kind) => {
    expect(planKindFor(goals)).toBe(kind);
  });
});

describe("goalSpaces", () => {
  it("starts the shelf with every picked goal's space, once", () => {
    expect(goalSpaces(["food", "date", "food"])).toEqual([
      "Date nights",
      "Restaurants to try",
    ]);
    expect(goalSpaces([...GOALS])).toEqual([
      "Date nights",
      "Travel",
      "Restaurants to try",
    ]);
  });
});

it("reads stored goals in order and drops anything else", () => {
  expect(readGoals(["food", "recipes", "date", 3])).toEqual(["date", "food"]);
  expect(readGoals("date")).toEqual([]);
  expect(primaryGoal(["food", "travel"])).toBe("travel");
  expect(primaryGoal([])).toBeNull();
});

it("knows only the answers onboarding asks", () => {
  for (const goal of GOALS) expect(isGoal(goal)).toBe(true);
  expect(isGoal("recipes")).toBe(false);
  expect(isSavedCount("hundreds")).toBe(true);
  expect(isSavedCount("thousands")).toBe(false);
});

describe("cityQuestion", () => {
  it("asks where the next trip goes when trips lead the goals", () => {
    expect(cityQuestion(["travel"])).toBe("trip");
    expect(cityQuestion(["travel", "food"])).toBe("trip");
  });

  it("asks where a person goes out when a date or food leads", () => {
    expect(cityQuestion(["date"])).toBe("out");
    expect(cityQuestion(["date", "travel", "food"])).toBe("out");
    expect(cityQuestion(["food"])).toBe("out");
    expect(cityQuestion([])).toBe("out");
  });
});

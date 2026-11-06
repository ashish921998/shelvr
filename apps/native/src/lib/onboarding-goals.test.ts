import { describe, expect, it } from "vitest";
import {
  GOALS,
  asksTripSoon,
  cityQuestion,
  goalSpaces,
  isGoal,
  isPlanner,
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
  expect(isPlanner("explorer")).toBe(true);
  expect(isPlanner(undefined)).toBe(false);
});

describe("asksTripSoon", () => {
  it.each([
    [[], true],
    [["travel"], true],
    [["date", "travel", "food"], true],
    [["date"], false],
    [["food", "date"], false],
  ] as const)("for the goals %j is %s", (goals, expected) => {
    expect(asksTripSoon(goals)).toBe(expected);
  });
});

describe("cityQuestion", () => {
  it("asks where a planned trip goes", () => {
    expect(cityQuestion(["travel"], "soon")).toBe("trip");
    expect(cityQuestion(["date", "travel", "food"], "soon")).toBe("trip");
  });

  it("asks where a person goes out, or for a dream city when they want everything", () => {
    expect(cityQuestion(["travel"], "notYet")).toBe("out");
    expect(cityQuestion(["date", "food"], null)).toBe("out");
    expect(cityQuestion(["date", "travel", "food"], "notYet")).toBe("dream");
    expect(cityQuestion([], null)).toBe("dream");
  });

  it("ignores a trip answer left from before Trips was unticked", () => {
    expect(cityQuestion(["date"], "soon")).toBe("out");
  });
});

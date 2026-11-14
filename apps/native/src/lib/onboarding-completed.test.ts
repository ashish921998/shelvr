import { describe, expect, it } from "vitest";
import { onboardingCompletedProperties } from "./onboarding-completed";

describe("onboardingCompletedProperties", () => {
  it("lists the travel vibes apart from the topics, and counts them as spaces", () => {
    expect(
      onboardingCompletedProperties([
        "Travel",
        "Good food",
        "Date nights",
        "AI & tech",
        "Read later",
        "Prague",
      ]),
    ).toEqual({
      save_pileup: [],
      interests: ["Travel", "AI & tech"],
      travel_vibes: ["Good food", "Date nights"],
      space_count: 6,
      space_names: [
        "Travel",
        "Good food",
        "Date nights",
        "AI & tech",
        "Read later",
      ],
      custom_space_count: 1,
      sample_city: null,
      goal: null,
      goals: [],
      saved_count: null,
      been_count: 0,
      $set: { save_pileup: [] },
    });
  });

  it("sends empty lists when nothing was picked", () => {
    expect(onboardingCompletedProperties([])).toMatchObject({
      interests: [],
      travel_vibes: [],
      space_count: 0,
      space_names: [],
      custom_space_count: 0,
    });
  });

  it("sends every survey answer, with the goal that leads", () => {
    expect(
      onboardingCompletedProperties(["Date nights", "Travel"], {
        travelCity: "paris",
        goals: ["date", "travel"],
        savedCount: "fiftyToTwoHundred",
      }),
    ).toMatchObject({
      goal: "date",
      goals: ["date", "travel"],
      saved_count: "fiftyToTwoHundred",
      sample_city: "paris",
    });
  });

  it("counts the cities they have been to without naming them", () => {
    const properties = onboardingCompletedProperties([], {
      beenCities: ["lisbon", "madrid"],
    });
    expect(properties.been_count).toBe(2);
    expect(JSON.stringify(properties)).not.toContain("lisbon");
  });
});

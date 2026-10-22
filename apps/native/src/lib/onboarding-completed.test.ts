import { describe, expect, it } from "vitest";
import { onboardingCompletedProperties } from "./onboarding-completed";

describe("onboardingCompletedProperties", () => {
  it("lists the travel vibes apart from the topics, and counts them as spaces", () => {
    expect(
      onboardingCompletedProperties(
        ["Travel"],
        [
          "Travel",
          "Good food",
          "Date nights",
          "AI & tech",
          "Read later",
          "Prague",
        ],
      ),
    ).toEqual({
      save_pileup: [],
      save_types: ["Travel"],
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
      $set: { save_pileup: [], save_types: ["Travel"] },
    });
  });

  it("sends empty lists when nothing was picked", () => {
    expect(onboardingCompletedProperties([], [])).toMatchObject({
      interests: [],
      travel_vibes: [],
      space_count: 0,
      space_names: [],
      custom_space_count: 0,
    });
  });
});

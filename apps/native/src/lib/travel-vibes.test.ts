import { describe, expect, it } from "vitest";
import { INTERESTS, type Interest } from "./onboarding-interests";
import { isPresetSpace } from "./save-kinds";
import {
  TRAVEL_VIBES,
  isTravelVibe,
  spacesAfterInterestToggle,
} from "./travel-vibes";

describe("spacesAfterInterestToggle", () => {
  it.each<[string, string[], Interest, string[]]>([
    ["picks a topic", ["Read later"], "AI & tech", ["Read later", "AI & tech"]],
    ["unpicks a topic", ["AI & tech", "Travel"], "AI & tech", ["Travel"]],
    [
      "drops the vibes with Travel",
      ["AI & tech", "Travel", "Good food", "Hidden gems"],
      "Travel",
      ["AI & tech"],
    ],
    [
      "keeps the vibes when another topic is unpicked",
      ["Travel", "Good food", "AI & tech"],
      "AI & tech",
      ["Travel", "Good food"],
    ],
    [
      "keeps a typed space that is not a vibe when Travel is unpicked",
      ["Travel", "Date nights", "Prague"],
      "Travel",
      ["Prague"],
    ],
  ])("%s", (_name, spaces, interest, expected) => {
    expect(spacesAfterInterestToggle(spaces, interest)).toEqual(expected);
  });

  it("leaves the given list alone", () => {
    const spaces = ["Travel", "Going out"];
    spacesAfterInterestToggle(spaces, "Travel");
    expect(spaces).toEqual(["Travel", "Going out"]);
  });
});

describe("TRAVEL_VIBES", () => {
  it("names five kinds of spots, none of them a topic", () => {
    expect(TRAVEL_VIBES).toHaveLength(5);
    for (const vibe of TRAVEL_VIBES) {
      expect(isTravelVibe(vibe)).toBe(true);
      expect(INTERESTS).not.toContain(vibe);
    }
    expect(isTravelVibe("Travel")).toBe(false);
    expect(isTravelVibe("good food")).toBe(false);
  });

  it("counts every vibe as a preset space, not a typed name", () => {
    for (const vibe of TRAVEL_VIBES) expect(isPresetSpace(vibe)).toBe(true);
  });
});

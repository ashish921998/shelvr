import { describe, expect, it } from "vitest";
import { INTERESTS } from "./onboarding-interests";
import { isPresetSpace } from "./save-kinds";
import { TRAVEL_VIBES, isTravelVibe } from "./travel-vibes";

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

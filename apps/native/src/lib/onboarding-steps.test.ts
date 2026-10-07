import { describe, expect, it } from "vitest";
import {
  previousOnboardingStep,
  restoreOnboardingStep,
} from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each([
    [0, "opener"],
    [1, "source"],
    [2, "setup"],
    [3, "demo"],
    [4, "reveal"],
    [5, "share"],
  ] as const)("restores step %i to %s", (stored, expected) => {
    expect(restoreOnboardingStep(stored)).toBe(expected);
  });

  it.each([null, -1, 6, 7, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );
});

describe("previousOnboardingStep", () => {
  it.each([
    ["source", "opener"],
    ["setup", "source"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it.each(["opener", "demo", "reveal", "share"] as const)(
    "has no way back from %s",
    (step) => {
      expect(previousOnboardingStep(step)).toBeNull();
    },
  );
});

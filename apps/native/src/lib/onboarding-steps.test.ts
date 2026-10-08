import { describe, expect, it } from "vitest";
import {
  previousOnboardingStep,
  restoreOnboardingStep,
} from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each([
    [0, "opener"],
    [1, "interests"],
    [2, "setup"],
    [3, "demo"],
    [4, "notifications"],
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
    ["interests", "opener"],
    ["setup", "interests"],
    ["notifications", "demo"],
    ["share", "notifications"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it.each(["opener", "demo"] as const)(
    "leaves %s without a fixed step to go back to",
    (step) => {
      expect(previousOnboardingStep(step)).toBeNull();
    },
  );
});

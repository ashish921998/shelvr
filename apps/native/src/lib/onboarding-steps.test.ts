import { describe, expect, it } from "vitest";
import {
  previousOnboardingStep,
  restoreOnboardingStep,
} from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each([
    [0, "opener"],
    [1, "setup"],
    [2, "demo"],
    [3, "reveal"],
    [4, "share"],
  ] as const)("restores step %i to %s", (stored, expected) => {
    expect(restoreOnboardingStep(stored)).toBe(expected);
  });

  it.each([null, -1, 5, 6, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );
});

describe("previousOnboardingStep", () => {
  it("goes back from setup to the opener", () => {
    expect(previousOnboardingStep("setup")).toBe("opener");
  });

  it.each(["opener", "demo", "reveal", "share"] as const)(
    "has no way back from %s",
    (step) => {
      expect(previousOnboardingStep(step)).toBeNull();
    },
  );
});

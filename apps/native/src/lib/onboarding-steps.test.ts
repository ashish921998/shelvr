import { describe, expect, it } from "vitest";
import { restoreOnboardingStep } from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each([
    [0, "opener"],
    [1, "setup"],
    [2, "demo"],
    [3, "reveal"],
  ] as const)("restores step %i to %s", (stored, expected) => {
    expect(restoreOnboardingStep(stored)).toBe(expected);
  });

  it.each([null, -1, 4, 5, 7, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );
});

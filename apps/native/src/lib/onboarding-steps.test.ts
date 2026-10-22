import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  previousOnboardingStep,
  restoreOnboardingStep,
} from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each([
    [0, "opener"],
    [1, "interests"],
    [2, "share"],
    [3, "promise"],
    [4, "tripBuild"],
    [5, "tripLocked"],
    [6, "tripReveal"],
  ] as const)("restores step %i to %s", (stored, expected) => {
    expect(restoreOnboardingStep(stored)).toBe(expected);
  });

  it.each([null, -1, 7, 11, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );
});

describe("previousOnboardingStep", () => {
  it.each([
    ["interests", "opener"],
    ["share", "interests"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it.each([
    "opener",
    "promise",
    "tripBuild",
    "tripLocked",
    "tripReveal",
  ] as const)("leaves %s without a fixed step to go back to", (step) => {
    expect(previousOnboardingStep(step)).toBeNull();
  });
});

describe("ONBOARDING_STEP_IDS", () => {
  it("names every step once, so funnels can split on it", () => {
    const ids = ONBOARDING_STEPS.map((step) => ONBOARDING_STEP_IDS[step]);
    expect(new Set(ids).size).toBe(ONBOARDING_STEPS.length);
  });

  it("gives the sample trip steps their own ids", () => {
    expect(ONBOARDING_STEP_IDS.tripBuild).toBe("trip_build");
    expect(ONBOARDING_STEP_IDS.tripLocked).toBe("trip_locked");
    expect(ONBOARDING_STEP_IDS.tripReveal).toBe("trip_reveal");
  });
});

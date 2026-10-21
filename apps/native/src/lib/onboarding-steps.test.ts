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
    [2, "setup"],
    [3, "demo"],
    [4, "notifications"],
    [5, "share"],
    [6, "promise"],
    [7, "tripBuild"],
    [8, "tripLocked"],
    [9, "tripReveal"],
  ] as const)("restores step %i to %s", (stored, expected) => {
    expect(restoreOnboardingStep(stored)).toBe(expected);
  });

  it.each([null, -1, 10, 11, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );

  it("keeps every index a v9 record could hold on the same step", () => {
    // The sample trip steps were added after the promise step, so a record
    // written before them still points where it did.
    expect(ONBOARDING_STEPS.slice(0, 7)).toEqual([
      "opener",
      "interests",
      "setup",
      "demo",
      "notifications",
      "share",
      "promise",
    ]);
  });
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

  it.each([
    "opener",
    "demo",
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

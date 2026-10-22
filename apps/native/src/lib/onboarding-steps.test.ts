import { describe, expect, it } from "vitest";
import { goalFlow } from "./onboarding-goals";
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  previousOnboardingStep,
  restoreOnboardingStep,
} from "./onboarding-steps";

describe("restoreOnboardingStep", () => {
  it.each(ONBOARDING_STEPS.map((step, index) => [index, step] as const))(
    "restores step %i to %s",
    (stored, expected) => {
      expect(restoreOnboardingStep(stored)).toBe(expected);
    },
  );

  it.each([null, -1, ONBOARDING_STEPS.length, 11, 1.5])(
    "restarts a missing or out-of-range index (%s) at the opener",
    (stored) => {
      expect(restoreOnboardingStep(stored)).toBe("opener");
    },
  );
});

describe("previousOnboardingStep", () => {
  it.each([
    ["travel", "goal", "opener"],
    ["travel", "city", "goal"],
    ["food", "share", "city"],
    ["other", "interests", "goal"],
    ["other", "share", "interests"],
  ] as const)(
    "in the %s flow goes back from %s to %s",
    (goal, step, expected) => {
      expect(previousOnboardingStep(step, goalFlow(goal))).toBe(expected);
    },
  );

  it.each(["opener", "tripBuild", "tripReveal", "promise"] as const)(
    "leaves %s without a step to go back to, so the sample is never rebuilt",
    (step) => {
      expect(previousOnboardingStep(step, goalFlow("date"))).toBeNull();
    },
  );
});

describe("ONBOARDING_STEP_IDS", () => {
  it("names every step once, so funnels can split on it", () => {
    const ids = ONBOARDING_STEPS.map((step) => ONBOARDING_STEP_IDS[step]);
    expect(new Set(ids).size).toBe(ONBOARDING_STEPS.length);
  });
});

import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  nextOnboardingStep,
  previousOnboardingStep,
  restoreOnboardingStep,
  type OnboardingStep,
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
    ["savedCount", "opener"],
    ["goal", "savedCount"],
    ["planner", "goal"],
    ["city", "planner"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it.each(["opener", "ahaShare", "ahaSpots", "ahaPlan", "reminder"] as const)(
    "leaves %s without a step to go back to, so the sample never replays",
    (step) => {
      expect(previousOnboardingStep(step)).toBeNull();
    },
  );
});

describe("nextOnboardingStep", () => {
  it("walks the questions, the city and the sample, then asks about the reminder", () => {
    const walked: OnboardingStep[] = [ONBOARDING_STEPS[0]];
    while (walked.length < ONBOARDING_STEPS.length)
      walked.push(nextOnboardingStep(walked[walked.length - 1]));
    expect(walked).toEqual([...ONBOARDING_STEPS]);
    expect(nextOnboardingStep("reminder")).toBe("reminder");
  });
});

describe("ONBOARDING_STEP_IDS", () => {
  it("names every step once, so funnels can split on it", () => {
    const ids = ONBOARDING_STEPS.map((step) => ONBOARDING_STEP_IDS[step]);
    expect(new Set(ids).size).toBe(ONBOARDING_STEPS.length);
  });
});

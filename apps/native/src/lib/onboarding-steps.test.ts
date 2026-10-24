import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  nextOnboardingStep,
  onboardingProgress,
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
    ["chart", "planner"],
    ["city", "chart"],
    ["ahaShare", "city"],
    ["ahaSpots", "ahaShare"],
    ["ahaPlan", "ahaSpots"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it("leaves the opener without a step to go back to", () => {
    expect(previousOnboardingStep("opener")).toBeNull();
  });
});

describe("nextOnboardingStep", () => {
  it("walks the questions, the city and the sample, and stays on the sample plan", () => {
    const walked: OnboardingStep[] = [ONBOARDING_STEPS[0]];
    while (walked.length < ONBOARDING_STEPS.length)
      walked.push(nextOnboardingStep(walked[walked.length - 1]));
    expect(walked).toEqual([...ONBOARDING_STEPS]);
    expect(nextOnboardingStep("ahaPlan")).toBe("ahaPlan");
  });
});

describe("ONBOARDING_STEP_IDS", () => {
  it("names every step once, so funnels can split on it", () => {
    const ids = ONBOARDING_STEPS.map((step) => ONBOARDING_STEP_IDS[step]);
    expect(new Set(ids).size).toBe(ONBOARDING_STEPS.length);
  });
});

describe("onboardingProgress", () => {
  it("has no bar on the opener and fills evenly to the sample plan", () => {
    expect(onboardingProgress("opener")).toBeNull();
    const bars = ONBOARDING_STEPS.slice(1).map(onboardingProgress);
    expect(bars.at(-1)).toBe(1);
    bars.forEach((bar, index) => {
      if (index > 0) expect(bar).toBeGreaterThan(bars[index - 1] ?? 0);
    });
  });
});

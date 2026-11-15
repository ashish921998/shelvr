import { describe, expect, it } from "vitest";
import {
  viewedBeforeResume,
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

  it.each([null, -1, ONBOARDING_STEPS.length, 1.5])(
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
    ["been", "goal"],
    ["chart", "been"],
    ["city", "chart"],
    ["cityEcho", "city"],
    ["ahaShare", "cityEcho"],
    ["firstSave", "ahaShare"],
    ["ahaSpots", "firstSave"],
    ["carousel", "ahaSpots"],
    ["notifications", "carousel"],
  ] as const)("goes back from %s to %s", (step, expected) => {
    expect(previousOnboardingStep(step)).toBe(expected);
  });

  it("leaves the opener without a step to go back to", () => {
    expect(previousOnboardingStep("opener")).toBeNull();
  });
});

describe("nextOnboardingStep", () => {
  it("walks every step in order and stays on the last", () => {
    const walked: OnboardingStep[] = [ONBOARDING_STEPS[0]];
    while (walked.length < ONBOARDING_STEPS.length)
      walked.push(nextOnboardingStep(walked[walked.length - 1]));
    expect(walked).toEqual([...ONBOARDING_STEPS]);
    expect(nextOnboardingStep("notifications")).toBe("notifications");
  });

  it("goes from the goals to the been step, then the chart", () => {
    expect(nextOnboardingStep("goal")).toBe("been");
    expect(nextOnboardingStep("been")).toBe("chart");
  });
});

describe("ONBOARDING_STEP_IDS", () => {
  it("names every step once, so funnels can split on it", () => {
    const ids = ONBOARDING_STEPS.map((step) => ONBOARDING_STEP_IDS[step]);
    expect(new Set(ids).size).toBe(ONBOARDING_STEPS.length);
  });

  it("names the been step been_cities", () => {
    expect(ONBOARDING_STEP_IDS.been).toBe("been_cities");
  });
});

describe("onboardingProgress", () => {
  it("has no bar on the opener and fills evenly to the last step", () => {
    expect(onboardingProgress("opener")).toBeNull();
    const bars = ONBOARDING_STEPS.slice(1).map((step) =>
      onboardingProgress(step),
    );
    expect(bars.at(-1)).toBe(1);
    bars.forEach((bar, index) => {
      if (index > 0) expect(bar).toBeGreaterThan(bars[index - 1] ?? 0);
    });
  });
});

describe("viewedBeforeResume", () => {
  it("is empty for a fresh start", () => {
    expect(viewedBeforeResume(null)).toEqual([]);
  });
  it("counts the resumed step and every step before it as viewed", () => {
    expect(viewedBeforeResume(2)).toEqual(["opener", "savedCount", "goal"]);
  });
  it("treats an unknown index as a fresh start", () => {
    expect(viewedBeforeResume(99)).toEqual([]);
    expect(viewedBeforeResume(1.5)).toEqual([]);
  });
});

export const ONBOARDING_STEPS = [
  "opener",
  "savedCount",
  "goal",
  "planner",
  "city",
  "ahaShare",
  "ahaSpots",
  "ahaPlan",
] as const;
export const ONBOARDING_FLOW_VERSION = 17;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  savedCount: "saved_count",
  goal: "goal",
  planner: "planner",
  city: "city",
  ahaShare: "aha_share",
  ahaSpots: "aha_spots",
  ahaPlan: "aha_plan",
};

/** The step before `step`; none on the opener. */
export function previousOnboardingStep(
  step: OnboardingStep,
): OnboardingStep | null {
  return ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) - 1] ?? null;
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? step;
}

/** `step` must be an index written by this flow version; getOnboardingProgress drops older flows' records. */
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

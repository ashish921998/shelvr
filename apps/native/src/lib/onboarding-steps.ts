export const ONBOARDING_STEPS = [
  "opener",
  "savedCount",
  "goal",
  "planner",
  "chart",
  "city",
  "ahaShare",
  "ahaSpots",
  "commitment",
  "notifications",
] as const;
export const ONBOARDING_FLOW_VERSION = 23;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  savedCount: "saved_count",
  goal: "goal",
  planner: "planner",
  chart: "progress_chart",
  city: "city",
  ahaShare: "aha_share",
  ahaSpots: "aha_spots",
  commitment: "commitment",
  notifications: "notification_ask",
};

/** How far along the header's bar is on `step`, from its place in the flow; the opener has no bar. */
export function onboardingProgress(step: OnboardingStep): number | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index === 0 ? null : index / (ONBOARDING_STEPS.length - 1);
}

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

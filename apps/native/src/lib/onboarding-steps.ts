export const ONBOARDING_STEPS = [
  "opener",
  "interests",
  "share",
  "promise",
  "tripBuild",
  "tripLocked",
  "tripReveal",
] as const;
export const ONBOARDING_FLOW_VERSION = 13;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  interests: "interests",
  share: "share_practice",
  promise: "promise",
  tripBuild: "trip_build",
  tripLocked: "trip_locked",
  tripReveal: "trip_reveal",
};

const PREVIOUS_STEP: Record<OnboardingStep, OnboardingStep | null> = {
  opener: null,
  interests: "opener",
  share: "interests",
  promise: null,
  tripBuild: null,
  tripLocked: null,
  tripReveal: null,
};

export function previousOnboardingStep(
  step: OnboardingStep,
): OnboardingStep | null {
  return PREVIOUS_STEP[step];
}

/** `step` must be an index written by this flow version; getOnboardingProgress drops older flows' records. */
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

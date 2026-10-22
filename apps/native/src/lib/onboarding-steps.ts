export const ONBOARDING_STEPS = [
  "opener",
  "interests",
  "setup",
  "demo",
  "notifications",
  "share",
  "promise",
  "tripBuild",
  "tripLocked",
  "tripReveal",
] as const;
export const ONBOARDING_FLOW_VERSION = 12;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  interests: "interests",
  demo: "live_demo",
  notifications: "notifications",
  share: "share_practice",
  promise: "promise",
  tripBuild: "trip_build",
  tripLocked: "trip_locked",
  tripReveal: "trip_reveal",
};

const PREVIOUS_STEP: Record<OnboardingStep, OnboardingStep | null> = {
  opener: null,
  interests: "opener",
  setup: "interests",
  demo: null,
  notifications: "demo",
  share: "notifications",
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

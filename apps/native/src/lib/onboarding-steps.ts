export const ONBOARDING_STEPS = [
  "opener",
  "interests",
  "setup",
  "demo",
  "notifications",
  "share",
  "promise",
] as const;
export const ONBOARDING_FLOW_VERSION = 8;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  interests: "interests",
  demo: "live_demo",
  notifications: "notifications",
  share: "share_practice",
  promise: "promise",
};

const PREVIOUS_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
  interests: "opener",
  setup: "interests",
  notifications: "demo",
  share: "notifications",
};

export function previousOnboardingStep(
  step: OnboardingStep,
): OnboardingStep | null {
  return PREVIOUS_STEP[step] ?? null;
}

export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

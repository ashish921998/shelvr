export const ONBOARDING_STEPS = [
  "opener",
  "goal",
  "city",
  "interests",
  "share",
  "tripBuild",
  "tripReveal",
  "promise",
  "recipeReveal",
] as const;
export const ONBOARDING_FLOW_VERSION = 14;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  goal: "goal",
  city: "city",
  interests: "interests",
  share: "share_practice",
  promise: "promise",
  tripBuild: "trip_build",
  tripReveal: "trip_reveal",
  recipeReveal: "recipe_reveal",
};

const NO_BACK: readonly OnboardingStep[] = [
  "opener",
  "tripBuild",
  "tripReveal",
  "recipeReveal",
  "promise",
];

/** The step before `step` in `flow`; none once the sample is being built, so the build never replays. */
export function previousOnboardingStep(
  step: OnboardingStep,
  flow: readonly OnboardingStep[],
): OnboardingStep | null {
  if (NO_BACK.includes(step)) return null;
  return flow[flow.indexOf(step) - 1] ?? null;
}

/** `step` must be an index written by this flow version; getOnboardingProgress drops older flows' records. */
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

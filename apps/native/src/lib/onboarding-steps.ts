export const ONBOARDING_STEPS = [
  "opener",
  "savedCount",
  "goal",
  "been",
  "chart",
  "city",
  "cityEcho",
  "ahaShare",
  "firstSave",
  "ahaSpots",
  "carousel",
  "notifications",
] as const;
export const ONBOARDING_FLOW_VERSION = 27;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  savedCount: "saved_count",
  goal: "goal",
  been: "been_cities",
  chart: "progress_chart",
  city: "city",
  cityEcho: "city_echo",
  ahaShare: "aha_share",
  firstSave: "first_save",
  ahaSpots: "aha_spots",
  carousel: "carousel",
  notifications: "notification_ask",
};

export function onboardingProgress(step: OnboardingStep): number | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index <= 0 ? null : index / (ONBOARDING_STEPS.length - 1);
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

export function viewedBeforeResume(step: number | null): OnboardingStep[] {
  if (step === null || !Number.isInteger(step) || !ONBOARDING_STEPS[step])
    return [];
  return ONBOARDING_STEPS.slice(0, step + 1);
}

import { asksTripSoon, type Goal } from "@/lib/onboarding-goals";

export const ONBOARDING_STEPS = [
  "opener",
  "savedCount",
  "goal",
  "tripSoon",
  "planner",
  "chart",
  "city",
  "cityEcho",
  "ahaShare",
  "firstSave",
  "ahaSpots",
  "carousel",
  "notifications",
] as const;
export const ONBOARDING_FLOW_VERSION = 24;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  savedCount: "saved_count",
  goal: "goal",
  tripSoon: "trip_soon",
  planner: "planner",
  chart: "progress_chart",
  city: "city",
  cityEcho: "city_echo",
  ahaShare: "aha_share",
  firstSave: "first_save",
  ahaSpots: "aha_spots",
  carousel: "carousel",
  notifications: "notification_ask",
};

function walkedSteps(goals: readonly Goal[]): readonly OnboardingStep[] {
  return asksTripSoon(goals)
    ? ONBOARDING_STEPS
    : ONBOARDING_STEPS.filter((step) => step !== "tripSoon");
}

export function onboardingProgress(
  step: OnboardingStep,
  goals: readonly Goal[],
): number | null {
  const steps = walkedSteps(goals);
  const index = steps.indexOf(step);
  return index <= 0 ? null : index / (steps.length - 1);
}

/** The step before `step`; none on the opener. */
export function previousOnboardingStep(
  step: OnboardingStep,
  goals: readonly Goal[],
): OnboardingStep | null {
  const steps = walkedSteps(goals);
  return steps[steps.indexOf(step) - 1] ?? null;
}

export function nextOnboardingStep(
  step: OnboardingStep,
  goals: readonly Goal[],
): OnboardingStep {
  const steps = walkedSteps(goals);
  return steps[steps.indexOf(step) + 1] ?? step;
}

/** `step` must be an index written by this flow version; getOnboardingProgress drops older flows' records. */
export function restoreOnboardingStep(
  step: number | null,
  goals: readonly Goal[],
): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  const restored = ONBOARDING_STEPS[step];
  if (restored === undefined) return "opener";
  return walkedSteps(goals).includes(restored)
    ? restored
    : nextOnboardingStep(ONBOARDING_STEPS[step - 1] ?? "opener", goals);
}

export function viewedBeforeResume(
  step: number | null,
  goals: readonly Goal[],
): OnboardingStep[] {
  if (step === null || !Number.isInteger(step) || !ONBOARDING_STEPS[step])
    return [];
  const walked = walkedSteps(goals);
  return ONBOARDING_STEPS.slice(0, step + 1).filter((s) => walked.includes(s));
}

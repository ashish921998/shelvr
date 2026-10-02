export const ONBOARDING_STEPS = [
  "opener",
  "source",
  "setup",
  "demo",
  "reveal",
] as const;
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step.
export const ONBOARDING_FLOW_VERSION = 3;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  source: "acquisition_source",
  setup: "setup",
  demo: "live_demo",
  reveal: "reveal",
};

// Takes an index in this flow's step list. getOnboardingProgress returns null
// for records from flows before version 2 and shifts version 2 indexes into
// this list, so an index from another step list never reaches here.
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

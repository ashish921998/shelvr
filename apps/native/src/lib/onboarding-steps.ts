export const ONBOARDING_STEPS = [
  "opener",
  "source",
  "setup",
  "demo",
  "notifications",
  "reveal",
] as const;
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step,
// 4 the notifications step.
export const ONBOARDING_FLOW_VERSION = 4;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  source: "acquisition_source",
  setup: "setup",
  demo: "live_demo",
  notifications: "notifications",
  reveal: "reveal",
};

// Takes an index written by this flow. getOnboardingProgress already returns
// null for records from older flows, whose indexes point at different steps.
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

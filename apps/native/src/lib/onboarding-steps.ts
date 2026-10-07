export const ONBOARDING_STEPS = [
  "opener",
  "setup",
  "demo",
  "reveal",
  "share",
] as const;
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step.
// 4 made the first save one tap on every platform, previews a ready-made
// sample before sign-in, and added the share step. 5 dropped the source step
// and the preview: a signed-out sample asks for sign-in, then saves once.
export const ONBOARDING_FLOW_VERSION = 5;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  demo: "live_demo",
  reveal: "reveal",
  share: "share_practice",
};

// Only setup goes back. From the demo on, the one demo save is spent and
// sign-in may have happened, so an earlier screen would be stale.
const PREVIOUS_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
  setup: "opener",
};

export function previousOnboardingStep(
  step: OnboardingStep,
): OnboardingStep | null {
  return PREVIOUS_STEP[step] ?? null;
}

// Takes an index written by this flow. getOnboardingProgress already returns
// null for records from older flows, whose indexes point at different steps.
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

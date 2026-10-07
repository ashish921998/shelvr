export const ONBOARDING_STEPS = [
  "opener",
  "interests",
  "setup",
  "demo",
  "reveal",
  "share",
] as const;
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step.
// 4 made the first save one tap on every platform, previews a ready-made
// sample before sign-in, and added the share step. 5 dropped the source step,
// and a previewed sample goes from sign-in straight to the reveal. 6 added
// the interests step after the opener.
export const ONBOARDING_FLOW_VERSION = 6;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  interests: "interests",
  demo: "live_demo",
  reveal: "reveal",
  share: "share_practice",
};

// The demo step is missing on purpose: what back means there depends on
// which of its screens is up, so the step tells the screen itself.
const PREVIOUS_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
  interests: "opener",
  setup: "interests",
  reveal: "demo",
  share: "reveal",
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

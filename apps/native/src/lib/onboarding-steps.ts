export const ONBOARDING_STEPS = [
  "opener",
  "interests",
  "setup",
  "demo",
  "notifications",
  "share",
] as const;
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step,
// 4 the notifications step. 5 and 6 never shipped. 7 dropped the source step,
// added the interests step after the opener and the share step at the end,
// dropped the reveal step (the paywall opens straight after the notifications
// step), made the first save one tap on every platform, previews a ready-made
// sample before sign-in, and takes a previewed sample from sign-in straight on.
export const ONBOARDING_FLOW_VERSION = 7;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  interests: "interests",
  demo: "live_demo",
  notifications: "notifications",
  share: "share_practice",
};

// The demo step is missing on purpose: what back means there depends on
// which of its screens is up, so the step tells the screen itself. The share
// step comes after the paywall, so it has nothing to go back to.
const PREVIOUS_STEP: Partial<Record<OnboardingStep, OnboardingStep>> = {
  interests: "opener",
  setup: "interests",
  notifications: "demo",
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

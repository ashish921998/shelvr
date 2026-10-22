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
// Sent with every step event. step_index means different steps in different
// flows, so funnels split by this or filter on step_id. 3 added the source step,
// 4 the notifications step. 5 and 6 never shipped. 7 dropped the source step,
// added the interests step after the opener and the share step at the end,
// dropped the reveal step (the paywall opens when the share step is left), made the first save one tap on every platform, previews a ready-made
// sample before sign-in, and takes a previewed sample from sign-in straight on.
// 8 added the promise step after the share step; the paywall opens from it.
// 9 moved sign-in after the paywall: a signed-out first save waits for the
// account, and the paywall sells before it exists.
// 10 added the sample trip steps after the promise step, for people who save
// travel: the trip builds, shows locked, opens the paywall, and opens up after
// a purchase. Everyone else still goes from the promise step to the paywall.
// 11 asks people who pick Travel on the interests step what kind of spots they
// like; each pick is a space, listed on onboarding_completed as travel_vibes.
// The steps are unchanged.
export const ONBOARDING_FLOW_VERSION = 11;

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
  promise: "promise",
  tripBuild: "trip_build",
  tripLocked: "trip_locked",
  tripReveal: "trip_reveal",
};

// The promise step and the sample trip steps have no way back: a practice
// share that reached Shelvr stays held, a share step that finds one moves
// straight on again, and a purchase cannot be taken back by a step.
// The demo step is missing on purpose: what back means there depends on
// which of its screens is up, so the step tells the screen itself.
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

// Takes an index written by this flow. getOnboardingProgress already returns
// null for records from older flows, whose indexes point at different steps.
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

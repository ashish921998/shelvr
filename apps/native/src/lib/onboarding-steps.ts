export const ONBOARDING_STEPS = ["opener", "setup", "demo", "reveal"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Analytics step ids predate this flow; "live_demo" keeps the demo funnel
// comparable with earlier onboarding versions.
export const ONBOARDING_STEP_IDS: Record<OnboardingStep, string> = {
  opener: "opener",
  setup: "setup",
  demo: "live_demo",
  reveal: "reveal",
};

// Records from the older 8-step flow store indexes up to 7. Those restart at
// the opener instead of landing on an unrelated screen.
export function restoreOnboardingStep(step: number | null): OnboardingStep {
  if (step === null || !Number.isInteger(step)) return "opener";
  return ONBOARDING_STEPS[step] ?? "opener";
}

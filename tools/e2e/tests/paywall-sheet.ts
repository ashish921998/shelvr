import { expect, type Screen } from "e2e";

import { tapUntilVisible } from "./seeded-home.ts";

// RevenueCat's 3-step paywall: an intro whose copy follows the onboarding
// goal, the trial timeline, then the plans. The buttons are the same for
// every goal. It has no close control, so a test leaves it by relaunching.

export function paywallYearly(screen: Screen) {
  return screen.getByRole("button", /^Yearly, /);
}

export function paywallWeekly(screen: Screen) {
  return screen.getByRole("button", /^Weekly, /);
}

export function paywallTrialButton(screen: Screen) {
  return screen.getByRole("button", /^Try for /);
}

export async function expectPaywall(screen: Screen): Promise<void> {
  // A tap that lands while the paywall slides in is dropped, and each step
  // stays in the tree under the next, so tap until the next step's own
  // control shows. The plan gate's See plans can sit under the paywall too.
  await expect(screen.getByRole("button", "Continue")).toBeVisible({
    timeout: 60_000,
  });
  await tapUntilVisible(
    screen.getByRole("button", "Continue"),
    screen.getByRole("button", "Go back"),
    { waitMs: 5_000, timeout: 60_000 },
  );
  await tapUntilVisible(
    screen.getByRole("button", "See plans").last(),
    paywallYearly(screen),
    { waitMs: 5_000, timeout: 60_000 },
  );
  await expect(paywallWeekly(screen)).toBeVisible();
  await expect(paywallTrialButton(screen)).toBeVisible();
  await expect(screen.getByRole("button", "Restore")).toBeVisible();
}

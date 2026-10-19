import { expect, type Screen } from "e2e";

/**
 * The production-mirrored V3 paywall: check the trial, then switch plans
 * in its sheet and verify the purchase action follows the selected plan.
 */
export async function expectPaywall(screen: Screen): Promise<void> {
  const plans = screen.getByRole("button", "View all plans");
  await expect(plans).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByRole("button", "Close").first()).toBeVisible();
  await expect(screen.getByRole("button", /Restore purchases/i)).toBeVisible();
  await plans.tap();
  await screen.getByRole("button", /^Monthly, /).tap();
  await expect(
    screen.getByRole("button", "Subscribe monthly").last(),
  ).toBeVisible();
  await expect(
    screen.getByText(/month, billed today\. Cancel anytime\./).last(),
  ).toBeVisible();
  await screen.getByRole("button", /^Annual, /).tap();
  await expect(
    screen
      .getByRole("button", /^(Start \d+-day free trial|Subscribe annually)$/)
      .last(),
  ).toBeVisible();
  // Close the plan picker, leaving the main paywall for the caller.
  await screen.getByRole("button", "Close").first().tap();
  await expect(screen.getByRole("button", /Restore purchases/i)).toBeVisible();
}

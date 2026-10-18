import { expect, type Screen } from "e2e";

/**
 * Waits for the Pro paywall and checks it can actually sell: both plans and
 * the purchase button, not only its title.
 */
export async function expectPaywall(screen: Screen): Promise<void> {
  await expect(screen.getByText("Shelvr Pro")).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByRole("button", /^Monthly, /)).toBeVisible();
  await expect(screen.getByRole("button", /^Annual, /)).toBeVisible();
  await expect(screen.getByRole("button", "Continue")).toBeVisible();
  await expect(screen.getByRole("button", "Restore Purchases")).toBeVisible();
}

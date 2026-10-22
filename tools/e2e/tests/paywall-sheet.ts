import { expect, type Screen } from "e2e";

/** The paywall's restore button. */
function paywallRestore(screen: Screen) {
  return screen.getByRole("button", /^Restore purchases$/i);
}

/**
 * The paywall's title. The plan gate under the paywall has its own Restore
 * Purchases button, so the open and close checks wait on this instead.
 */
export function paywallTitle(screen: Screen) {
  return screen.getByText("How free trial works");
}

/**
 * Waits for the Pro paywall and checks it can actually sell: the plan on
 * offer, the way to the other plans, and the purchase button, not only its
 * title. Matches the v3 trial-timeline design, without its test prices.
 */
export async function expectPaywall(screen: Screen): Promise<void> {
  await expect(paywallTitle(screen)).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByText(/Shelvr Pro/)).toBeVisible();
  await expect(screen.getByRole("button", /^7-day trial, /)).toBeVisible();
  await expect(screen.getByRole("button", "View all plans")).toBeVisible();
  await expect(
    screen.getByRole("button", "Start 7-day free trial"),
  ).toBeVisible();
  await expect(paywallRestore(screen)).toBeVisible();
}

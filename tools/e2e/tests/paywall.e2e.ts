import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallRestore } from "./paywall-sheet.ts";
import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

/**
 * Closes the paywall and waits until Home is back. No exit offer follows the
 * close: the launch argument that hides Pro also skips it.
 */
async function closePaywall(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Close").first().tap();
  await expect(paywallRestore(screen)).toBeHidden({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "View Pro plans")).toBeVisible();
}

// The dev user is always Pro, so the app is relaunched with the launch
// argument that makes a development build show them as not Pro
// (src/lib/e2e-hide-pro.ts). The next test's setup relaunches without it.
test("shows the paywall instead of Add to someone without Pro", async ({
  device,
  screen,
}) => {
  await device.openApp(BUNDLE_ID, {
    relaunch: true,
    launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
  });
  const viewPlans = screen.getByRole("button", "View Pro plans");
  await expect(viewPlans).toBeVisible({ timeout: 180_000 });
  // The relaunch plays the launch splash again, over a Home that is already
  // in the tree.
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });

  // Add is a Pro action: it opens the paywall, not the Add sheet.
  await screen.getByRole("button", "Add").tap();
  await expectPaywall(screen);
  await closePaywall(screen);
  await expect(screen.getByTestId("add-option-note")).toBeHidden();

  // Home's own prompt opens the same paywall.
  await viewPlans.tap();
  await expectPaywall(screen);
  await closePaywall(screen);

  // Home is as it was: the four seeded saves, and nothing being saved.
  await expect(screen.getByRole("button", "Still working on it")).toBeHidden();
  for (const seeded of [
    "ramen",
    "belem-tower",
    "apartment-checklist",
    "value-of-craft",
  ]) {
    await expect(screen.getByTestId(`fixture-item-${seeded}`)).toBeVisible();
  }
});

// The exit offer after a paywall close, asked for with a second launch
// argument, since hiding Pro skips it otherwise. Its sheet hosts
// RevenueCat's paywall full-screen, and when the design fails to render
// RevenueCat's fallback has no close, so the app keeps a close of its own on
// top (PR #194 shipped without one, and the offer could not be left).
test("leaves the exit offer by the app's own close", async ({
  device,
  screen,
}) => {
  await device.openApp(BUNDLE_ID, {
    relaunch: true,
    launchArguments: [
      ...LAUNCH_ARGUMENTS,
      "-E2EHidePro",
      "YES",
      "-E2EExitOffer",
      "YES",
    ],
  });
  const viewPlans = screen.getByRole("button", "View Pro plans");
  await expect(viewPlans).toBeVisible({ timeout: 180_000 });
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });

  await viewPlans.tap();
  await expectPaywall(screen);
  await screen.getByRole("button", "Close").first().tap();

  const close = screen.getByTestId("exit-offer-close");
  await expect(close).toBeVisible({ timeout: 60_000 });
  await expect(screen.getByText(/^Your first year/)).toBeVisible();
  await expect(screen.getByText("No Paywall configured")).toBeHidden();
  await close.tap();
  await expect(close).toBeHidden({ timeout: 30_000 });
  // Home holds the offer open for its window in place of the Pro prompt.
  await expect(screen.getByRole("button", "See the offer")).toBeVisible({
    timeout: 30_000,
  });
});

test(
  "updates billing disclosure when switching monthly and annual plans",
  { retries: 0 },
  async ({ device, screen }) => {
    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    const viewPlans = screen.getByRole("button", "View Pro plans");
    await expect(viewPlans).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    await viewPlans.tap();
    await expectPaywall(screen);

    await screen.getByRole("button", "View all plans").tap();
    await screen.getByRole("button", /^Monthly, /).tap();
    await expect(
      screen.getByRole("button", "Subscribe monthly").last(),
    ).toBeVisible();
    await expect(
      screen.getByText(/month, billed today\. Cancel anytime\./).last(),
    ).toBeVisible();
    await screen.getByRole("button", /^Annual, /).tap();
    await expect(
      screen.getByRole("button", "Start 7-day free trial").last(),
    ).toBeVisible();
    await screen.getByRole("button", "Close").first().tap();
    await expectPaywall(screen);
    await closePaywall(screen);
  },
);

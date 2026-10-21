import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";
import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

/** Closes the paywall and waits until the plan gate is back. */
async function closePaywall(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Close").first().tap();
  await expect(paywallTitle(screen)).toBeHidden({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "See plans")).toBeVisible();
}

// The dev user is always Pro, so the app is relaunched with the launch
// argument that makes a development build show them as not Pro
// (src/lib/e2e-hide-pro.ts). The next test's setup relaunches without it.
test("keeps someone without Pro on the plan gate", async ({
  device,
  screen,
}) => {
  await device.openApp(BUNDLE_ID, {
    relaunch: true,
    launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
  });
  const seePlans = screen.getByRole("button", "See plans");
  await expect(seePlans).toBeVisible({ timeout: 180_000 });
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
  await expect(screen.getByText("Pick a plan to open Shelvr")).toBeVisible();

  // No entry without a plan: Home, its saves and Add are not reachable.
  await expect(screen.getByRole("button", "Add")).toBeHidden();
  await expect(screen.getByTestId("fixture-item-ramen")).toBeHidden();

  // The gate opens the paywall, and closing it comes back to the gate.
  await seePlans.tap();
  await expectPaywall(screen);
  await closePaywall(screen);
  await expect(screen.getByRole("button", "Add")).toBeHidden();

  // Settings, where restore and account deletion live, stays reachable.
  await screen.getByRole("button", "Settings").tap();
  await expect(screen.getByRole("button", "Delete account")).toBeVisible({
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
    const seePlans = screen.getByRole("button", "See plans");
    await expect(seePlans).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    await seePlans.tap();
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

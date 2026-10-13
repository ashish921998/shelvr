import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

async function expectPaywall(screen: Screen): Promise<void> {
  await expect(screen.getByText("Shelvr Pro")).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByRole("button", /^Monthly, /)).toBeVisible();
  await expect(screen.getByRole("button", /^Annual, /)).toBeVisible();
  await expect(screen.getByRole("button", "Continue")).toBeVisible();
  await expect(screen.getByRole("button", "Restore Purchases")).toBeVisible();
}

/**
 * Closes the paywall and waits until Home is back. This expects no exit
 * offer to follow the close: development builds have not shown one, and the
 * flow would need to handle its sheet and Home card if they start to.
 */
async function closePaywall(screen: Screen): Promise<void> {
  // The close control has no label; it is the first button on the sheet.
  await screen.getByRole("button").first().tap();
  await expect(screen.getByRole("button", "Restore Purchases")).toBeHidden({
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

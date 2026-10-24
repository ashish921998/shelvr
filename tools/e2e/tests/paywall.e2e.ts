import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";
import { scrollSettingsTo, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

async function closePaywall(screen: Screen): Promise<void> {
  await screen.getByRole("button", "Close").first().tap();
  await expect(paywallTitle(screen)).toBeHidden({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "See plans")).toBeVisible();
}

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

  await expect(screen.getByRole("button", "Add")).toBeHidden();
  await expect(screen.getByText("Your cities")).toBeHidden();

  await seePlans.tap();
  await expectPaywall(screen);
  await closePaywall(screen);
  await expect(screen.getByRole("button", "Add")).toBeHidden();

  await screen.getByRole("button", "Settings").tap();
  const deleteAccount = screen.getByRole("button", "Delete account");
  await scrollSettingsTo(screen, deleteAccount);
  await expect(deleteAccount).toBeVisible();
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

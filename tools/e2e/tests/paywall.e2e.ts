import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import {
  closePaywallTo,
  expectPaywall,
  openPaywallPlans,
  paywallTitle,
} from "./paywall-sheet.ts";
import { scrollSettingsTo, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

async function closePaywall(screen: Screen): Promise<void> {
  await closePaywallTo(screen, screen.getByRole("button", "See plans"));
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
  "updates billing disclosure when switching weekly and yearly plans",
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

    await openPaywallPlans(screen);
    await screen.getByRole("button", /^Weekly, /).tap();
    await expect(
      screen.getByRole("button", /^Subscribe for .*\/week$/).last(),
    ).toBeVisible();
    await expect(
      screen.getByText(/week from today\. Auto-renews until canceled\./).last(),
    ).toBeVisible();
    await screen.getByRole("button", /^Yearly, /).tap();
    await expect(
      screen.getByRole("button", /^Try for .*then .*\/year$/).last(),
    ).toBeVisible();
    await expect(
      screen
        .getByText(/7-day trial, then .*year\. Auto-renews until canceled\./)
        .last(),
    ).toBeVisible();
    await screen.getByRole("button", "Go back").first().tap();
    await screen.getByRole("button", "Go back").first().tap();
    await expectPaywall(screen);
    await closePaywall(screen);
  },
);

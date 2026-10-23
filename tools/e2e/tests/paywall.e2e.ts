import { test, type Device } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import {
  expectPaywall,
  paywallTrialButton,
  paywallWeekly,
  paywallYearly,
} from "./paywall-sheet.ts";
import { scrollSettingsTo, startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

async function openPlanGate(device: Device, screen: Screen) {
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
  return seePlans;
}

test("keeps someone without Pro on the plan gate", async ({
  device,
  screen,
}) => {
  const seePlans = await openPlanGate(device, screen);
  await expect(screen.getByRole("button", "Add")).toBeHidden();
  await expect(screen.getByTestId("fixture-item-ramen")).toBeHidden();

  await seePlans.tap();
  await expectPaywall(screen);

  // A relaunch is the only way out without buying; it lands on the gate again.
  await openPlanGate(device, screen);
  await expect(screen.getByRole("button", "Add")).toBeHidden();

  await screen.getByRole("button", "Settings").tap();
  const deleteAccount = screen.getByRole("button", "Delete account");
  await scrollSettingsTo(screen, deleteAccount);
  await expect(deleteAccount).toBeVisible();
});

test(
  "updates the buy button and billing line when switching yearly and weekly",
  { retries: 0 },
  async ({ device, screen }) => {
    const seePlans = await openPlanGate(device, screen);
    await seePlans.tap();
    await expectPaywall(screen);

    await expect(
      screen.getByText(/^7-day trial, then .+\/year\. Auto-renews/),
    ).toBeVisible();
    await paywallWeekly(screen).tap();
    await expect(
      screen.getByRole("button", /^Subscribe for .+\/week$/),
    ).toBeVisible();
    await expect(
      screen.getByText(/\/week from today\. Auto-renews until canceled\./),
    ).toBeVisible();
    await expect(paywallTrialButton(screen)).toBeHidden();
    await paywallYearly(screen).tap();
    await expect(paywallTrialButton(screen)).toBeVisible();
  },
);

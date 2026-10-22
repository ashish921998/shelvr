import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_LATER,
  queueFirstSave,
  relaunchWith,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";

afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

test(
  "asks for the paywall at the end of onboarding, and a close keeps it there",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen);
    await queueFirstSave(screen);

    const shareLater = screen.getByRole("button", SHARE_LATER);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => shareLater.isVisible(),
    );

    await shareLater.tap();
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });
    await expectPaywall(screen);

    const commit = screen.getByRole("button", "I'm in");
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await commit.tap();
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(commit).toBeVisible({ timeout: 30_000 });

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    await expect(commit).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

test(
  "builds a sample trip before the paywall for someone who saves travel",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen, "Travel");
    await queueFirstSave(screen);

    await screen.getByRole("button", SHARE_LATER).tap();
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });

    const unlock = screen.getByRole("button", "Unlock the full trip");
    await expect(unlock).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByText(/sample Prague trip/)).toBeVisible();
    await unlock.tap();
    await expectPaywall(screen);

    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(unlock).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

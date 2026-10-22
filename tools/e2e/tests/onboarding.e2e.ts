import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_LATER,
  relaunchWith,
  startFreshOnboarding,
  walkToSharePractice,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";

// Leave the app signed out at the opener, not mid-onboarding, for the next test.
afterEach(async ({ device, screen }) => {
  await startFreshOnboarding({ device, screen });
  await device.closeApp().catch(() => undefined);
});

test(
  "asks for the paywall at the end of onboarding, and a close keeps it there",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSharePractice(screen);

    const shareLater = screen.getByRole("button", SHARE_LATER);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => shareLater.isVisible(),
    );

    await shareLater.tap();
    await screen.getByRole("button", "Let's go").tap({ timeout: 30_000 });
    await expectPaywall(screen);

    const commit = screen.getByRole("button", "Let's go");
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
  "shows a sample trip, open, before the promise and the paywall for someone saving travel ideas",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSharePractice(screen, "Travel ideas");

    await screen.getByRole("button", SHARE_LATER).tap();
    await expect(screen.getByText(/^There it is\./)).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen.getByText(/^Sample trip$/i)).toBeVisible();
    await expect(screen.getByText("Staré Město")).toBeVisible();
    await screen.getByRole("button", "Continue").tap();

    const commit = screen.getByRole("button", "Let's go");
    await commit.tap({ timeout: 30_000 });
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_ON_REEL,
  relaunchWith,
  shareTheSampleReel,
  startFreshOnboarding,
  walkToSampleReel,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";

const COMMIT = "Continue";

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
    await walkToSampleReel(screen);

    const share = screen.getByRole("button", SHARE_ON_REEL);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => share.isVisible(),
    );

    await shareTheSampleReel(screen);
    // The sample spots open the paywall, and stay put when the paywall closes.
    const commit = screen.getByRole("button", COMMIT);
    await commit.tap({ timeout: 30_000 });
    await expectPaywall(screen);

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
  "turns one sample reel into a date night's spots, then asks for the paywall",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    await shareTheSampleReel(screen);
    // Skipping the city picks Prague, whose Shelvr example names these three. Each name is both a
    // map pin's title and a row under it, so either one proves the spot landed.
    await expect(screen.getByText("Prague · 3 places")).toBeVisible({
      timeout: 30_000,
    });
    for (const place of ["Kampa Park", "Hemingway Bar", "Café Louvre"]) {
      await expect(screen.getByText(place).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    const commit = screen.getByRole("button", COMMIT);
    await commit.tap();
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

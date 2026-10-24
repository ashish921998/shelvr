import { afterEach, test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import {
  SHARE_TO_SHELVR,
  relaunchWith,
  startFreshOnboarding,
  walkToSampleReel,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallTitle } from "./paywall-sheet.ts";

const SAVE_YOUR_OWN = "Save your own spots";

// Leave the app signed out at the opener, not mid-onboarding, for the next test.
afterEach(async ({ device, screen }) => {
  await startFreshOnboarding({ device, screen });
  await device.closeApp().catch(() => undefined);
});

/** Saves the sample reel and walks its spots to the sample plan. */
async function walkTheSample(screen: Screen): Promise<void> {
  await screen.getByRole("button", SHARE_TO_SHELVR).tap();
  await expect(screen.getByText("Found 3 spots in that reel")).toBeVisible({
    timeout: 30_000,
  });
  const next = screen.getByRole("button", "Continue");
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.tap();
}

test(
  "asks for the paywall at the end of onboarding, and a close keeps it there",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    const share = screen.getByRole("button", SHARE_TO_SHELVR);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => share.isVisible(),
    );

    await walkTheSample(screen);
    // The sample plan opens the paywall, and stays put when the paywall closes.
    const commit = screen.getByRole("button", SAVE_YOUR_OWN);
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
  "turns one sample reel into a date night, then asks for the paywall",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    await screen.getByRole("button", SHARE_TO_SHELVR).tap();
    await expect(screen.getByText("Found 3 spots in that reel")).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen.getByText("Kampa Park")).toBeVisible({
      timeout: 30_000,
    });
    const next = screen.getByRole("button", "Continue");
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.tap();
    await expect(screen.getByText("Your date night in Prague")).toBeVisible({
      timeout: 30_000,
    });
    const commit = screen.getByRole("button", SAVE_YOUR_OWN);
    await commit.tap();
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

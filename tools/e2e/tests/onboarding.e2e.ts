import { afterEach, test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import {
  SHARE_LATER,
  relaunchWith,
  startFreshOnboarding,
  walkToSharePractice,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall } from "./paywall-sheet.ts";
import { tapUntilVisible } from "./seeded-home.ts";

const NOT_NOW = "Not now";

// A tap that lands while the notifications screen settles is dropped.
async function openPaywall(screen: Screen): Promise<void> {
  await tapUntilVisible(
    screen.getByRole("button", NOT_NOW),
    screen.getByRole("button", "Continue"),
    { waitMs: 5_000, timeout: 60_000 },
  );
}

// Leave the app signed out at the opener, not mid-onboarding, for the next test.
afterEach(async ({ device, screen }) => {
  await startFreshOnboarding({ device, screen });
  await device.closeApp().catch(() => undefined);
});

test(
  "asks for the paywall at the end of onboarding, and a relaunch comes back to it",
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
    // The notifications screen comes between the promise and the paywall. The
    // paywall has no close, so a relaunch is how someone leaves it; they land
    // back on the notifications screen, still signed out.
    const commit = screen.getByRole("button", NOT_NOW);
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await openPaywall(screen);
    await expectPaywall(screen);

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    await expect(commit).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await openPaywall(screen);
    await expectPaywall(screen);
  },
);

test(
  "shows a sample trip, open, then the promise, the notifications screen and the paywall for someone saving travel ideas",
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

    await screen.getByRole("button", "Let's go").tap({ timeout: 30_000 });
    await expect(screen.getByText(/^Remember every spot/)).toBeVisible({
      timeout: 30_000,
    });
    await openPaywall(screen);
    // The paywall's first step speaks to the travel goal.
    await expect(screen.getByText(/^Let.s plan your next trip/)).toBeVisible({
      timeout: 60_000,
    });
    await expectPaywall(screen);
  },
);

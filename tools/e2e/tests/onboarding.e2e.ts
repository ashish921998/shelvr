import { afterEach, test } from "@e2e-dev/mobile";
import { expect, type Locator, type Screen } from "e2e";

import {
  SHARE_ON_REEL,
  relaunchWith,
  shareTheSampleReel,
  startFreshOnboarding,
  walkToSampleReel,
  walkToRate,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import {
  closePaywallTo,
  continueToPaywall,
  expectPaywall,
  paywallTitle,
} from "./paywall-sheet.ts";

async function closeToRate(screen: Screen, rate: Locator) {
  await closePaywallTo(screen, rate);
  await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  await expect(screen.getByRole("button", "Add")).toBeHidden();
}

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
    await walkToRate(screen);
    // Not right now moves on to the paywall; closing returns to the screen before it.
    const rateAsk = await continueToPaywall(
      screen,
      screen.getByRole("button", "Not right now"),
    );

    await closeToRate(screen, rateAsk);
    await expect(rateAsk).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await rateAsk.tap();
    await expectPaywall(screen);
    await closeToRate(screen, rateAsk);
    await expect(rateAsk).toBeVisible({ timeout: 30_000 });

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    await expect(rateAsk).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

test(
  "uses a real Austin trip reel for a city without one",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen, app }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen, { goal: "travel", city: "Lisbon" });
    await expect(screen.getByRole("image", /^Sample/)).toBeVisible();
    await app.screenshot("austin-fallback-reel");
    await shareTheSampleReel(screen);
    await expect(screen.getByText("Austin · 3 places")).toBeVisible();
    for (const place of ["Austin Motel", "Heritage Boot Co.", "Jo's Coffee"]) {
      await expect(screen.getByText(place).first()).toBeVisible();
    }
    await walkToRate(screen);
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("austin-rate");
  },
);

test(
  "turns one sample reel into a date night's spots, then asks for the paywall",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen, app }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen);

    await expect(screen.getByRole("image", /^Sample/)).toBeVisible();
    await app.screenshot("austin-date-reel");

    await shareTheSampleReel(screen);
    // The skipped city uses a real Austin reel. Each name is both a map pin's title and a row.
    await expect(screen.getByText("Austin · 3 places")).toBeVisible({
      timeout: 30_000,
    });
    for (const place of ["Eberly", "The Guest House", "Jupiter Supper Club"]) {
      await expect(screen.getByText(place).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    await walkToRate(screen);
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("rate-before");
    const rateAsk = await continueToPaywall(
      screen,
      screen.getByRole("button", "Not right now"),
    );
    await closeToRate(screen, rateAsk);
    await expect(rateAsk).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

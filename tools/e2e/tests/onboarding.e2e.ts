import { afterEach, test } from "@e2e-dev/mobile";
import { expect, type Locator, type Screen } from "e2e";

import {
  shareTheSampleReel,
  startFreshOnboarding,
  walkToSampleReel,
  walkToCarouselEnd,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import {
  closePaywallTo,
  continueToPaywall,
  expectPaywall,
  paywallTitle,
} from "./paywall-sheet.ts";

async function closeToCarousel(screen: Screen, last: Locator) {
  await closePaywallTo(screen, last);
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
    const hidePro = ["-E2EHidePro", "YES"];
    await startFreshOnboarding({ device, screen }, hidePro);
    await walkToSampleReel(screen);

    await shareTheSampleReel(screen);
    // The carousel's last Continue moves on to the paywall; closing returns to that slide.
    const lastSlide = await continueToPaywall(
      screen,
      await walkToCarouselEnd(screen),
    );

    await closeToCarousel(screen, lastSlide);
    await expect(lastSlide).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await lastSlide.tap();
    await expectPaywall(screen);
    await closeToCarousel(screen, lastSlide);
    await expect(lastSlide).toBeVisible({ timeout: 30_000 });

    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, ...hidePro],
    });
    await expect(lastSlide).toBeVisible({ timeout: 180_000 });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

test(
  "plays the picked city's own reel",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen, app }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen, { goal: "date", city: "Las Vegas" });
    await expect(
      screen.getByRole("image", /^Sample reel by @?jinaham812/),
    ).toBeVisible({ timeout: 30_000 });
    await app.screenshot("las-vegas-reel");
    await shareTheSampleReel(screen);
    await expect(screen.getByText("Las Vegas · 3 places")).toBeVisible();
    for (const place of [
      "The Barbershop Cuts & Cocktails",
      "Ghost Donkey",
      "Secret Pizza",
    ]) {
      await expect(screen.getByText(place).first()).toBeVisible();
    }
    await app.screenshot("las-vegas-spots");
    await walkToCarouselEnd(screen);
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("las-vegas-carousel");
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
    // The skipped city uses Austin's reel. Each name is both a map pin's title and a row.
    await expect(screen.getByText("Austin · 3 places")).toBeVisible({
      timeout: 30_000,
    });
    for (const place of ["Austin Motel", "Heritage Boot", "Jo's Coffee"]) {
      await expect(screen.getByText(place).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    await app.screenshot("austin-spots");
    const last = await walkToCarouselEnd(screen);
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("carousel-before");
    const lastSlide = await continueToPaywall(screen, last);
    await closeToCarousel(screen, lastSlide);
    await expect(lastSlide).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_ON_REEL,
  relaunchWith,
  shareTheSampleReel,
  startFreshOnboarding,
  walkToSampleReel,
  walkToCommitment,
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
    await walkToSampleReel(screen);

    const share = screen.getByRole("button", SHARE_ON_REEL);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => share.isVisible(),
    );

    await shareTheSampleReel(screen);
    await walkToCommitment(screen);
    // Skipping the optional promise opens the paywall; closing returns to this screen.
    const commit = screen.getByRole("button", "Maybe later");
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
  "personalizes the commitment to the Lisbon trip and keeps confirmation on the same screen",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen, app }) => {
    await startFreshOnboarding({ device, screen });
    await walkToSampleReel(screen, { goal: "travel", city: "Lisbon" });
    await shareTheSampleReel(screen);
    await expect(screen.getByText("Lisbon · 3 places")).toBeVisible();
    await walkToCommitment(screen);
    const promise = screen.getByText(
      "I’ll visit one saved place on my Lisbon trip.",
    );
    await expect(promise).toBeVisible();
    for (const place of [
      "Castelo de São Jorge",
      "As Bifanas do Afonso",
      "Praça do Comércio",
    ]) {
      await expect(screen.getByText(place).first()).toBeVisible();
    }
    await app.screenshot("lisbon-commitment-before");
    const hold = screen.getByRole("button", "Hold to commit");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await hold.longPress({ duration: 600 });
      await expect(
        screen.getByRole("button", "Tap to commit instead"),
      ).toBeVisible();
      await expect(screen.getByText("You’re in.")).toBeHidden();
      await expect(screen.getByRole("button", "Continue")).toBeHidden();
    }
    await hold.longPress({ duration: 1200 });
    await expect(screen.getByText("You’re in.")).toBeVisible();
    await expect(promise).toBeVisible();
    await expect(screen.getByRole("button", "Continue")).toBeVisible();
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("lisbon-commitment-confirmed");
  },
);

test(
  "turns one sample reel into a date night's spots, then asks for the paywall",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen, app }) => {
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
    await walkToCommitment(screen);
    await expect(
      screen.getByText("I’ll visit one place I saved in Prague this week."),
    ).toBeVisible();
    for (const place of ["Kampa Park", "Hemingway Bar", "Café Louvre"]) {
      await expect(screen.getByText(place).first()).toBeVisible();
    }
    await app.screenshot("commitment-before");
    const hold = screen.getByRole("button", "Hold to commit");
    await hold.longPress({ duration: 1200 });
    await expect(screen.getByText("You’re in.")).toBeVisible();
    await expect(paywallTitle(screen)).toBeHidden();
    await app.screenshot("commitment-confirmed");
    const commit = screen.getByRole("button", "Continue");
    await commit.tap();
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
  },
);

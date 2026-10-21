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

// A run that stops partway leaves a signed-in user mid-onboarding, which the
// seeded flows after this one cannot get past (CI run 39048570372: seven
// files timed out on the reminder step). Clearing the keychain leaves the
// app on the opener, where they start from.
afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

// A first-time user who picked one link, relaunched mid-onboarding, took
// the promise and closed the paywall at the end: the paywall comes before the
// account, and closing it is no way past it. Pro is hidden from the relaunch
// on (src/lib/e2e-hide-pro.ts).
test(
  "asks for the paywall at the end of onboarding, and a close keeps it there",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen);
    await queueFirstSave(screen);

    // A relaunch here resumes on the share practice, not past it.
    const shareLater = screen.getByRole("button", SHARE_LATER);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => shareLater.isVisible(),
    );

    // The share practice, skipped, then the promise step, and then the
    // paywall, shown while still signed out.
    await shareLater.tap();
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });
    await expectPaywall(screen);

    // Signed out, a close is no way in: the promise step stays, and its
    // button brings the paywall back. Sign-in comes only after a purchase.
    const commit = screen.getByRole("button", "I'm in");
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallTitle(screen)).toBeHidden({ timeout: 30_000 });
    await expect(commit).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId("dev-login-button")).toBeHidden();
    await commit.tap();
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(commit).toBeVisible({ timeout: 30_000 });

    // No launch helper or whole-test retry may hide a native startup crash.
    // Allow a slow hosted Metro load, then require the splash to leave too.
    // A relaunch still lands on the promise step, signed out.
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

// Someone who saves travel gets a sample trip between the promise and the
// paywall: it builds by itself, then shows locked with one way on, which opens
// the paywall. Signed out, a close keeps the locked trip on screen, as the
// promise step stays for everyone else. Nobody else sees the trip (the test
// above picks Articles and goes straight from the promise to the paywall).
test(
  "builds a sample trip before the paywall for someone who saves travel",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen, "Travel");
    await queueFirstSave(screen);

    await screen.getByRole("button", SHARE_LATER).tap();
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });

    // The build takes a few seconds and moves on by itself.
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

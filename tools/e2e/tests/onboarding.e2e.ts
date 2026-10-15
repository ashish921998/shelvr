import { test } from "@e2e-dev/mobile";
import { expect, type Screen } from "e2e";

import { startFreshOnboarding, walkToFirstSave } from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";

/** The reminder step's question (`onboardingNotifications.title`). */
const REMINDER_STEP = /When should it come back\?/;

/**
 * Saves the featured sample as the first save, signing in with the dev
 * login on the way, and waits for the reminder step. The model is a
 * placeholder on CI, so the save may never be read: whichever way out the
 * reading screen offers is taken, since the reminder step only needs the
 * save to exist.
 */
async function saveFirstSample(screen: Screen): Promise<void> {
  await screen.getByRole("button", /^Save it, /).tap();
  await screen.getByTestId("onboarding-dev-login").tap({ timeout: 60_000 });

  const reminder = screen.getByText(REMINDER_STEP);
  const keepAi = screen.getByRole("button", "Keep it on");
  const skipWait = screen.getByRole("button", "Continue without waiting");
  const afterFailure = screen.getByRole("button", "Continue");
  await expect
    .poll(
      async () => {
        if (await reminder.isVisible()) return true;
        if (await keepAi.isVisible()) await keepAi.tap();
        else if (await skipWait.isVisible()) await skipWait.tap();
        else if (await afterFailure.isVisible()) await afterFailure.tap();
        return false;
      },
      { timeout: 120_000 },
    )
    .toBe(true);
}

// A first-time user who saved one link, relaunched on the reminder step and
// declined the paywall at the end. Pro is hidden for this user from the
// relaunch on (src/lib/e2e-hide-pro.ts), as it is for a real new user, so
// the end-of-onboarding paywall has someone to ask.
test("asks for the paywall at the end of onboarding, after a relaunch on the reminder step", async ({
  app,
  device,
  screen,
}) => {
  await startFreshOnboarding({ app, device, screen });
  await walkToFirstSave(screen);
  await saveFirstSample(screen);

  // A relaunch here resumes on the reminder step, not past it (PR #279
  // skipped it).
  await device.openApp(BUNDLE_ID, {
    relaunch: true,
    launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
  });
  await expect(screen.getByText(REMINDER_STEP)).toBeVisible({
    timeout: 180_000,
  });
  await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
    timeout: 30_000,
  });
  await screen.getByRole("button", "Don't remind me").tap();

  // The share practice, skipped, and then the paywall.
  await screen.getByRole("button", "I'll try it later").tap({
    timeout: 30_000,
  });
  await expect(screen.getByText("Shelvr Pro")).toBeVisible({
    timeout: 60_000,
  });
  await expect(screen.getByRole("button", "Restore Purchases")).toBeVisible();

  // A close is a decline, and onboarding ends on Home. No exit offer
  // follows: hiding Pro skips it.
  await screen.getByRole("button").first().tap();
  await expect(screen.getByRole("button", "Restore Purchases")).toBeHidden({
    timeout: 30_000,
  });
  await expect(screen.getByRole("button", "Profile")).toBeVisible({
    timeout: 30_000,
  });
});

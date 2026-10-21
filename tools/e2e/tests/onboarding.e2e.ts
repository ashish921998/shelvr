import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHARE_LATER,
  queueFirstSave,
  relaunchWith,
  signInAfterOnboarding,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallRestore } from "./paywall-sheet.ts";
import { pollUntil } from "./poll.ts";

// A run that stops partway leaves a signed-in user mid-onboarding, which the
// seeded flows after this one cannot get past (CI run 39048570372: seven
// files timed out on the reminder step). Clearing the keychain leaves the
// app on the opener, where they start from.
afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

// A first-time user who picked one link, relaunched mid-onboarding, took
// the promise, declined the paywall at the end and only then signed in: the
// paywall comes before the account, and sign-in is asked once. Pro is hidden
// from the relaunch on (src/lib/e2e-hide-pro.ts), so the dev user, Pro on
// the server, is treated as having no plan and lands on the plan gate.
test(
  "asks for the paywall at the end of onboarding, then sign-in once, then the plan gate",
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

    // A close is a decline. Signed out there is no exit offer, and the one
    // sign-in follows. Without a plan it ends on the plan gate.
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallRestore(screen)).toBeHidden({
      timeout: 30_000,
    });
    const gate = screen.getByRole("button", "See plans");
    await signInAfterOnboarding(screen, gate);

    // No launch helper or whole-test retry may hide a native startup crash.
    // Allow a slow hosted Metro load, then require the splash to leave too.
    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    // Pending starter spaces may ask again on the next launch
    // (replay-onboarding); close that sheet rather than accept the gate under
    // it.
    await pollUntil(
      async () => {
        if (await paywallRestore(screen).isVisible()) {
          await screen.getByRole("button", "Close").first().tap();
          return false;
        }
        return gate.isVisible();
      },
      { timeout: 180_000 },
    );
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByRole("button", "Start yours")).toBeHidden();
  },
);

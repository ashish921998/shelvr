import { afterEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  REMINDER_STEP,
  relaunchWith,
  signInAndSaveFirst,
  startFreshOnboarding,
  walkToFirstSave,
} from "./fresh-onboarding.ts";
import { BUNDLE_ID, LAUNCH_ARGUMENTS } from "./launch.ts";
import { expectPaywall, paywallRestore } from "./paywall-sheet.ts";

// A run that stops partway leaves a signed-in user mid-onboarding, which the
// seeded flows after this one cannot get past (CI run 39048570372: seven
// files timed out on the reminder step). Clearing the keychain leaves the
// app on the opener, where they start from.
afterEach(async ({ device }) => {
  await device.closeApp().catch(() => undefined);
  await device.clearKeychain();
});

// A first-time user who saved one link, relaunched on the reminder step,
// took the promise and declined the paywall at the end. Pro is hidden for
// this user from the relaunch on (src/lib/e2e-hide-pro.ts), as it is for a
// real new user, so the end-of-onboarding paywall has someone to ask.
test(
  "asks for the paywall at the end of onboarding and cold-launches Home",
  { retries: 0, timeout: 600_000 },
  async ({ device, screen }) => {
    await startFreshOnboarding({ device, screen });
    await walkToFirstSave(screen);
    await screen.getByRole("button", /^Save it, /).tap();
    await signInAndSaveFirst(screen);

    // A relaunch here resumes on the reminder step, not past it (PR #279
    // skipped it).
    const reminder = screen.getByText(REMINDER_STEP);
    await relaunchWith(
      device,
      screen,
      [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
      () => reminder.isVisible(),
    );
    await screen.getByRole("button", "Don't remind me").tap();

    // The share practice, skipped, then the promise step, and then the
    // paywall.
    await screen.getByRole("button", "I'll try it later").tap({
      timeout: 30_000,
    });
    await screen.getByRole("button", "I'm in").tap({ timeout: 30_000 });
    await expectPaywall(screen);

    // A close is a decline, and onboarding ends on Home. No exit offer
    // follows: hiding Pro skips it.
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallRestore(screen)).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByRole("button", "Profile")).toBeVisible({
      timeout: 30_000,
    });

    // No launch helper or whole-test retry may hide a native startup crash.
    // Allow a slow hosted Metro load, then require the splash to leave too.
    await device.openApp(BUNDLE_ID, {
      relaunch: true,
      launchArguments: [...LAUNCH_ARGUMENTS, "-E2EHidePro", "YES"],
    });
    // Declining only suppresses replay for that session. Pending starter
    // spaces intentionally ask again on the next launch (replay-onboarding).
    // Wait for that sheet rather than accepting Home underneath it.
    await expect(paywallRestore(screen)).toBeVisible({ timeout: 180_000 });
    await expectPaywall(screen);
    await screen.getByRole("button", "Close").first().tap();
    await expect(paywallRestore(screen)).toBeHidden({ timeout: 30_000 });
    await expect(screen.getByRole("button", "View Pro plans")).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen.getByRole("image", "Shelvr")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByTestId("SplashScreenLogo")).toBeHidden({
      timeout: 30_000,
    });
    await expect(screen.getByRole("button", "Start yours")).toBeHidden();
  },
);
